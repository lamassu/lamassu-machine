'use strict'

var serialPort = require('serialport')
var SerialPort = serialPort.SerialPort
var machina = require('machina')
const R = require('ramda')
const bitcore = require('bitcore-lib')
var Networks = bitcore.Networks

var device = process.argv[2]

var serial = new SerialPort(device,
{baudRate: 9600, parity: 'none', dataBits: 8, stopBits: 1})

var ACK = 0x06
var NAK = 0x15
var STX = 0xf2
var CMT = 0x43
var ETX = 0x03
var ADDR = 0x00
const PMT = 0x50
const EMT = 0x45
const NEG = 0x4e

serial.on('error', function (err) { console.log(err) })
serial.on('open', function () {
  console.log('INFO dispenser connected')
  serial.on('data', function (data) { processData(data) })
  serial.on('close', function () { console.log('disconnected') })

  run()
})

function computeBcc (packet) {
  var bcc = 0x00
  for (var i = 0; i < packet.length; i++) {
    bcc = packet[i] ^ bcc
  }
  return bcc
}

function buildFrame (cmd, param, data) {
  data = data || []
  const buf = Buffer.isBuffer(data) ? data : new Buffer(data)
  var txet = Buffer.concat([new Buffer([CMT, cmd, param]), buf])
  var txetLen = txet.length
  var prefix = new Buffer([STX, ADDR, 0x00, 0x00])
  prefix.writeUInt16BE(txetLen, 2)
  var packet = Buffer.concat([prefix, txet, new Buffer([ETX])])
  var bcc = computeBcc(packet)
  return Buffer.concat([packet, new Buffer([bcc])])
}

function sendFrame (frame) {
  serial.write(frame)
}

function processData (data) {
  for (let byte of data) {
    protocol.rx(byte)
  }
}

function processFrame (txet) {
  const header = txet[0]

  if (header === EMT || header === NEG) {
    const err = new Error('Response error')
    err.codes = txet.slice(3, 5)
    throw err
  }

  if (header !== PMT) throw new Error('Bad header value')

  return {
    status: txet.slice(3, 6),
    data: txet.slice(6)
  }
}

function sendAck () {
  serial.write(ACK)
}

function sendNak () {
  serial.write(NAK)
}

var protocol = new machina.Fsm({
  initialState: 'idle',
  states: {
    idle: {
      _onEnter: function () {
        if (this.lastFrame) protocol.command(this.lastFrame)
        this.incomingFrame = null
      },
      command: function (frame) {
        this.transition('waitForAck')
        sendFrame(frame)
      }
    },
    waitForAck: {
      _onEnter: function () { this.timeout() },
      data: function (b) {
        if (b === ACK) return this.transition('waitForResponse')
        if (b === NAK) return this.transition('idle')
      },
      timeout: 'idle',
      _onExit: function () {
        this.clearTimeout()
        this.lastFrame = null
      }
    },
    waitForResponse: {
      _onEnter: function () {
        this.incomingTxetLength = 0x00
        this.incomingFrame = new Buffer(0)
        // this.timeout()
      },
      timeout: function () { this.bail('response timeout') },
      data: function (b) {
        if (b === STX) protocol.transition('addr')
      }
    },
    addr: {
      timeout: () => protocol.bail('response timeout'),
      data: function (b) {
        if (b === 0x00) this.transition('lenh')
      }
    },
    lenh: {
      timeout: () => protocol.bail('response timeout'),
      data: function (b) {
        if (R.isNil(b)) return
        this.incomingFrameLength = b << 8
        this.transition('lenl')
      }
    },
    lenl: {
      timeout: () => protocol.bail('response timeout'),
      data: function (b) {
        if (R.isNil(b)) return
        this.incomingFrameLength |= b
        this.transition('txet')
      }
    },
    txet: {
      timeout: () => this.bail('response timeout'),
      data: function (b) {
        const txet = this.incomingFrame.slice(4, 4 + this.incomingFrameLength)
        if (txet.length < this.incomingFrameLength) return
        const etx = this.incomingFrame[this.incomingFrameLength + 4]
        if (etx !== ETX) return
        const bcc = this.incomingFrame[this.incomingFrameLength + 5]
        if (R.isNil(bcc)) return
        const bccPacket = this.incomingFrame.slice(0, -1)
        if (computeBcc(bccPacket) !== bcc) {
          this.transition('waitResponse')
          return sendNak()
        }
        sendAck()
        this.transition('idle')

        try {
          this.emit('response', processFrame(txet))
        } catch (err) {
          this.emit('error', err)
        }
      }
    }
  },
  timeout: function () {
    if (this.timeoutHandle) console('WARN: timeoutHandle is already set')
    this.timeoutHandle = setTimeout(() => this.transition('timeout'), 300)
  },
  clearTimeout: function () {
    clearTimeout(this.timeoutHandle)
    this.timeoutHandle = null
  },
  checkData: function () {
    if (this.incomingFrame.length > 0) this.emit('data')
  },
  idle: function () { this.handle('idle') },
  command: function (frame) { this.handle('command', frame) },
  rx: function (byte) {
    const newBuf = new Buffer([byte])
    if (this.incomingFrame) this.incomingFrame = Buffer.concat([this.incomingFrame, newBuf])
    this.handle('data', byte)
  }
})

function request (cmd, param, data) {
  return new Promise((resolve, reject) => {
    protocol.on('*', (eventName, data) => {
      if (!R.contains(eventName, ['response', 'error'])) return
      protocol.off()
      if (eventName === 'response') return resolve(data)
      if (eventName === 'error') return reject(data)
    })
    protocol.command(buildFrame(cmd, param, data))
  })
}

function initialize () {
  return request(0x30, 0x33)
}

function cardToChipReader () {
  return request(0x32, 0x31)
}

/*
function cardHold () {
  return request(0x32, 0x30)
}
*/

function cardEject () {
  return request(0x32, 0x39)
}

function cardReset () {
  return request(0x51, 0x30, [0x33])
}

function cardApdu (apdu) {
  return request(0x51, 0x34, apdu)
}

function cardOff () {
  return request(0x51, 0x31)
}

function acceptCard () {
  return request(0x33, 0x30)
}

function noAcceptCard () {
  return request(0x33, 0x31)
}

function checkCard () {
  return request(0x31, 0x30)
}

const apdu0 = '00A4040006A00000000107'
const apdu1 = 'b0010000'

function run () {
  protocol.idle()

  initialize()
  .then(acceptCard)
  .then(() => console.log('waiting for card...'))

  const pi = setInterval(function () {
    checkCard()
    .then(r => {
      if (r.status[0] === 0x32) {
        clearInterval(pi)
        console.log('Card present')
        return noAcceptCard()
        .then(cardToChipReader)
        .then(cardReset)
        .then(r => {
          console.log('ATR: 0x' + r.data.slice(1).toString('hex'))
          return cardApdu(new Buffer(apdu0, 'hex'))
        })
        .then(r => {
          return cardApdu(new Buffer(apdu1, 'hex'))
        })
        .then(r => {
          console.log('Address: ' + toAddress(r.data))
          return cardOff()
        })
        .then(cardEject)
        .then(() => process.exit(0))
        .catch(_ => {
          // e0, e1 was 0x36, 0x31
          console.log('*** Try turning the card around ***')
          return cardEject()
          .then(() => process.exit(1))
        })
      }
    })
  }, 1000)

/*
  initialize()
  .then(cardToChipReader)
  .then(cardReset)
  .then(r => {
    console.log('ATR: 0x' + r.data.slice(1).toString('hex'))
    return cardApdu(new Buffer(apdu0, 'hex'))
  })
  .then(r => {
    return cardApdu(new Buffer(apdu1, 'hex'))
  })
  .then(r => {
    console.log('Address: ' + toAddress(r.data))
    return cardOff()
  })
  .then(cardEject)
  .then(() => process.exit(0))
  .catch(err => console.log(err.stack))
*/
}

function toAddress (apdu) {
  const pubkeyStr = apdu.slice(0, -2).toString('hex')
  const pubkey = new bitcore.PublicKey(pubkeyStr, {network: Networks.testnet})
  return pubkey.toAddress()
}
