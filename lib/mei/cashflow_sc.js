const SerialPort = require('serialport')
const EventEmitter = require('events').EventEmitter
const util = require('util')
const _ = require('lodash/fp')

const BN = require('../bn')

const denominationsTable = require('./denominations')

const CashflowSc = function (config) {
  EventEmitter.call(this)
  this.fiatCode = null
  this.buf = Buffer.alloc(0)
  this.responseSize = null
  this.config = config
  this.serial = null
  this.ack = 0x0
  this.device = config.rs232.device
  this.enabledDenominations = 0x00
  this.currentStatus = null
}

module.exports = CashflowSc

util.inherits(CashflowSc, EventEmitter)
CashflowSc.factory = function factory (config) {
  return new CashflowSc(config)
}

const STX = 0x02
const ETX = 0x03
const ENQ = 0x05

const validatePacket = frame => {
  if (frame[0] !== STX) throw new Error("No STX present")
  const frameLength = frame.length
  if (frame[1] !== frameLength) throw new Error("Frame lengths don't match")
  if (frame[frameLength - 2] !== ETX) throw new Error('No ETX present')
  const checksum = computeChecksum(frame)
  if (frame[frameLength - 1] !== checksum) throw new Error('Bad checksum')
}

CashflowSc.prototype.setFiatCode = function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
}

CashflowSc.prototype.open = function open (cb) {
  const options = {
    baudRate: 9600,
    parity: 'even',
    dataBits: 7,
    stopBits: 1,
    autoOpen: false,
    rtscts: false
  }

  const serial = new SerialPort(this.device, options)
  this.serial = serial

  serial.on('error', err => this.emit('error', err))
  serial.on('open', () => {
    serial.on('data', data => this._process(data))
    serial.on('close', () => this.emit('disconnected'))
    this.emit('connected')
    cb()
  })

  serial.open()
}

CashflowSc.prototype.enable = function enable () {
  this.enabledDenominations = 0x7f // 7 bits, 1 bit for each denomination
  this._poll()
}

CashflowSc.prototype.disable = function disable () {
  this.enabledDenominations = 0x00
  this._poll()
}

CashflowSc.prototype.reject = function reject () {
  this._dispatch([this.enabledDenominations, 0x5f, 0x10])
}

CashflowSc.prototype.stack = function stack () {
  this._dispatch([this.enabledDenominations, 0x3f, 0x10])
}

CashflowSc.prototype._denominations = function _denominations () {
  return denominationsTable[this.fiatCode]
}

CashflowSc.prototype.lowestBill = function lowestBill (fiat) {
  var bills = this._denominations()
  const filtered = bills.filter(bill => fiat.lte(bill))
  if (_.isEmpty(filtered)) return BN(_.min(bills))
  return BN(_.min(filtered))
}

CashflowSc.prototype.highestBill = function highestBill (fiat) {
  var bills = this._denominations()
  var filtered = _.filter(bill => fiat.gte(bill), bills)
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
}

CashflowSc.prototype.hasDenominations = function hasDenominations () {
  return !!this._denominations()
}

CashflowSc.prototype.run = function run (cb) {
  this.open(() => {
    this._dispatch([0x00, 0x1b, 0x10])
    this.poller = setInterval(() => this._poll(), 10000)
    cb()
  })
}

CashflowSc.prototype.close = function close (cb) {
  clearInterval(this.poller)
  this.serial.close(cb)
}

CashflowSc.prototype.lightOn = function lightOn () {}
CashflowSc.prototype.lightOff = function lightOff () {}
CashflowSc.prototype.monitorHeartbeat = function monitorHeartbeat () {}

CashflowSc.prototype._process = function _process (data) {
  if (this.buf.length === 0 && data.length === 1 && data[0] === ENQ) {
    return this._processEvent()
  }

  this.buf = Buffer.concat([this.buf, data])
  this.buf = this._acquireSync(this.buf)

  // Wait for size byte
  if (this.buf.length < 2) return

  var responseSize = this.buf[1]

  // Wait for whole packet
  if (this.buf.length < responseSize) return

  var packet = this.buf.slice(0, responseSize)
  this.buf = this.buf.slice(responseSize)

  try {
    this._parse(packet)
  } catch (ex) {
    console.log(ex)
    process.nextTick(() => this._process(data.slice(1)))
  }
}

CashflowSc.prototype._parse = function _parse (packet) {
  validatePacket(packet)
  const result = interpret(packet)
  if (!result) return

  const { status } = result
  if (this.currentStatus === status || status === 'blankStack') return
  this.currentStatus = status

  console.log('DEBUG: %s', status)

  // For escrow, need to emit both billAccepted and billRead
  if (status === 'billRead') {
    if (!result.bill || result.bill.code !== this.fiatCode) {
      console.log("WARNING: Bill validator, shouldn't happen:", this.fiatCode)
      console.dir(result.bill && result.bill.code)
      return this.reject()
    }

    this.emit('billAccepted')
    return process.nextTick(() => this.emit('billRead', result.bill))
  }

  // This can happen when cashbox is re-inserted
  if (status === 'billValid' && result.bill && !result.bill.denomination) return

  if (status) return this.emit(status)
}

CashflowSc.prototype._acquireSync = function _acquireSync (data) {
  var payload = null
  for (var i = 0; i < data.length; i++) {
    if (data[i] === STX) {
      payload = data.slice(i)
      break
    }
  }

  return (payload || Buffer.alloc(0))
}

CashflowSc.prototype._processEvent = function _processEvent () {
  this._poll()
}

/* Appendix D (Controller Message) */
CashflowSc.prototype._dispatch = function _dispatch (data) {
  var frame = this._buildFrame(data)
  this.serial.write(frame)
}

CashflowSc.prototype._poll = function _poll () {
  this._dispatch([this.enabledDenominations, 0x1b, 0x10])
}

/* Appendix D (Acceptor Message) */
function parseStatus (data) {
  return data[0].stacked ? 'billValid' :
    data[0].escrowed ? 'billRead' :
    // NOTE: A billAccepted event is emitted right before a billRead so there's
    // no need to return billAccepted here.
    //(data[0].accepting || data[0].stacking) ? 'billAccepted' :
    (data[0].returned || data[1].cheated || data[1].rejected) ? 'billRejected' :
    data[1].jammed ? 'jam' :
    !data[1].cassetteAttached ? 'stackerOpen' :
    data[0].idling ? 'idle' :
    null
}

/* Appendix D (Acceptor Message) */
const destructData = data => {
  if (data.length < 6) return null

  const getNth = n => b => Boolean((b >> n) & 0b1)
  const getNths = (f, t) => b => {
    const n = t - f
    const mask = (0b1 << n) - 1
    return (b >> f) & mask
  }
  /* §7.1.2 */
  const bytes = [
    {
      idling:    getNth(0),
      accepting: getNth(1),
      escrowed:  getNth(2),
      stacking:  getNth(3),
      stacked:   getNth(4),
      returning: getNth(5),
      returned:  getNth(6),
    },
    {
      cheated:          getNth(0),
      rejected:         getNth(1),
      jammed:           getNth(2),
      stackerFull:      getNth(3),
      cassetteAttached: getNth(4),
      paused:           getNth(5),
      calibrating:      getNth(6),
    },
    {
      powerup:        getNth(0),
      invalidCommand: getNth(1),
      failure:        getNth(2),
      noteValue:      getNths(3, 6),
      transportOpen:  getNth(6),
    },
    {
      stalled:            getNth(0),
      flashDownload:      getNth(1),
      prestack:           getNth(2),
      rawBarcode:         getNth(3),
      deviceCapabilities: getNth(4),
      disabled:           getNth(5),
    },
    { modelNumber: getNths(0, 7), },
    { codeRevision: getNths(0, 7), }
  ]

  const destructByte = (fields, byte) => _.mapValues(f => f(byte), fields)

  return _.flow(
    _.zip(_.range(0, 6)),
    _.map(([idx, fields]) => destructByte(fields, data[idx])),
  )(bytes)
}

function parseStandard (frame, { data }) {
  const destructedData = destructData(data)
  const status = parseStatus(destructedData)
  return { status, destructedData }
}

/* §7.5.2 */
function parseExtended (frame, { data }) {
  const EXTENDED_OFFSET = 7

  const msgSubType = data[0]
  if (msgSubType !== 0x02) return null

  const extendedData = data.slice(EXTENDED_OFFSET, EXTENDED_OFFSET+18)
  data = data.slice(1, EXTENDED_OFFSET)

  const destructedExtendedData = {
    index: extendedData[0],
    code: extendedData.slice(1, 4).toString('ascii'),
    base: parseInt(extendedData.slice(4, 7), 10),
    sign: extendedData[7] === 0x2b ? +1 :
          extendedData[7] === 0x2d ? -1 :
          null,
    exponent: parseInt(extendedData.slice(8, 10), 10),
    orientation: extendedData[10],
    type: extendedData[11],
    series: extendedData[12],
    compatibility: extendedData[13],
    version: extendedData[14],
    banknoteClassification: extendedData[15],
    reserved: extendedData.slice(15, 18)
  }

  const { code, base, sign, exponent } = destructedExtendedData

  // A "blank stack" may happen on power up or when re-inserting the cash
  // cassette. In practice, all of these four conditions should be met in a
  // "blank stack".
  const blankStack = code === Buffer.from([0x0,0x0,0x0])
    || sign === null
    || isNaN(base)
    || isNaN(exponent)

  const destructedData = destructData(data)

  const [status, denomination] = blankStack ?
    ['blankStack', null] :
    [parseStatus(destructedData), base * Math.pow(10, sign * exponent)]

  return {
    status,
    bill: { denomination, code },
    msgSubType,
    destructedData,
    destructedExtendedData,
  }
}

/* §6.4 */
const destructCtlByte = ctl => ({
  ack: ctl & 0b1,
  devType: (ctl >> 1) & 0b111,
  msgType: (ctl >> 4) & 0b111,
})

/* §6.1.1 */
const destructFrame = frame => {
  const [stx, len, ctl, ...rest] = frame
  if (frame.length < 3 || frame.length !== len) return null
  const data = Buffer.from(rest.slice(0, len-5))
  const [etx, chk] = rest.slice(len-5)

  return { stx, len, ctl: destructCtlByte(ctl), data, etx, chk }
}

function interpret (frame) {
  console.log('IN: %s', frame.toString('hex'))
  console.log('frame length:', frame.length)

  const destructedFrame = destructFrame(frame)
  console.log('destructedFrame:', destructedFrame)

  const { ctl: { msgType } } = destructedFrame

  /* §6.4.3 */
  return (msgType === 0b010) ? parseStandard(frame, destructedFrame) :
    (msgType === 0b111) ? parseExtended(frame, destructedFrame) :
    null
}

CashflowSc.prototype._buildFrame = function _buildFrame (data) {
  var length = data.length + 5
  if (length > 0xff) throw new Error('Data length is too long!')
  this.ack = ~this.ack & 0b1
  var ctl = 0x10 | this.ack /* §6.4.3 */
  var frame = [STX, length, ctl].concat(data, ETX, 0x00) /* §6.1.1. */
  var checksum = computeChecksum(frame)
  frame[frame.length - 1] = checksum
  return Buffer.from(frame)
}

// Works on both buffers and arrays
function computeChecksum (frame) {
  var cs = 0x00
  // Exclude STX, ETX and checksum fields
  for (var i = 1; i < frame.length - 2; i++) {
    cs = frame[i] ^ cs
  }
  return cs
}

/*
var bv = CashflowSc.factory({
  rs232: {device: '/dev/ttyUSB0'},
})

bv.setFiatCode('EUR')
bv.on('connected', function () { console.log('connected.'); })
bv.on('error', function (err) { console.log('Error: %s', err); })
bv.open(function () {
  bv._dispatch([0x7f, 0x1b, 0x10])
  bv.enable()
  setInterval(function() {
    bv._poll()
  }, 10000)
})

//setTimeout(function() { bv.enable(); }, 5000)

bv.on('billRead', function(denomination) {
  console.log('Got a bill: %d', denomination)
  bv.reject()
//  if (denomination === 5) bv.reject()
//  else bv.stack()
})

bv.on('billRejected', function() { console.log('Bill rejected'); })
bv.on('billAccepted', function() { console.log('Bill accepted'); })
bv.on('billValid', function() { console.log('Bill valid'); })
*/
