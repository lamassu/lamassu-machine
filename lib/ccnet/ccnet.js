const EventEmitter = require('events').EventEmitter
const util = require('util')
const _ = require('lodash/fp')

const BN = require('../bn')
const rs232 = require('./ccnet-rs232')
const statesFsm = require('./states-fsm')
const { commands, responses } = require('./consts')

const respMap = _.invert(responses)

const POLLING_INTERVAL = 200

const Ccnet = function (config) {
  EventEmitter.call(this)
  this.pollingInterval = null
  this.device = config.rs232.device
  this.fiatCode = null
  this.denominations = null
  this._throttledError = _.throttle(2000, err => this.emit('error', err))
}

util.inherits(Ccnet, EventEmitter)
Ccnet.factory = function factory (config) {
  return new Ccnet(config)
}

Ccnet.prototype.setFiatCode = function (fiatCode) {
  this.fiatCode = fiatCode
}

Ccnet.prototype.lightOn = _.noop

Ccnet.prototype.lightOff = _.noop

Ccnet.prototype.run = function (cb) {
  return rs232.create(this.device)
    .then(() => {
      rs232.emitter.on('handleResponse', (response, command) => this._handleResponse(response, command))
      rs232.emitter.on('error', (err) => this._throttledError(err))
      rs232.emitter.on('disconnected', () => this.emit('disconnected'))
      statesFsm.on('command', it => this._send(it))
      statesFsm.on('billAccepted', () => this.emit('billAccepted'))
      statesFsm.on('jam', () => this.emit('jam'))
      statesFsm.on('billValid', () => this.emit('billValid'))
      statesFsm.on('billRejected', () => this.emit('billRejected'))
      statesFsm.on('stackerOpen', () => this.emit('stackerOpen'))
      statesFsm.on('billRead', (data) => {
        const denomination = this._denominations()[data[0]]
        if (!denomination) {
          console.log('bill rejected: unsupported denomination.')
          this._send(commands.RETURN)
          return
        }
        this.emit('billRead', { denomination })
      })
    })
    .then(() => {
      this._startPolling()
      this._connect()

      const t0 = Date.now()
      const denominationsInterval = setInterval(() => {
        if (this.hasDenominations()) {
          clearInterval(denominationsInterval)
          return cb()
        }

        if (Date.now() - t0 > 5000) {
          clearInterval(denominationsInterval)
          cb(new Error('Timeout waiting for denominations'))
        }
      }, 500)
    })
    .catch(cb)
}

Ccnet.prototype.close = function (cb) {
  this._stopPolling()
  rs232.close(function (err) {
    if (err) console.log(err)
    cb(err)
  })
}

Ccnet.prototype.getBillsToEnable = function () {
  // at this point this enables every bill available on the firmware
  // take fiatCode into account once we do that in id003 as well
  const billsBuffer = Buffer.alloc(3)
  const billsToEnable = _.keys(this._denominations())

  billsToEnable.forEach(it => {
    writeBit(billsBuffer, 2 - Math.floor(it / 8), it % 8, 1)
  })

  return Buffer.concat([billsBuffer, billsBuffer])
}

Ccnet.prototype.enable = function () {
  const billsBuffer = this.getBillsToEnable()

  const command = Buffer.concat([commands.ENABLE_BILL_TYPES, billsBuffer])
  this._send(command)
}

Ccnet.prototype.disable = function () {
  const command = Buffer.concat([commands.ENABLE_BILL_TYPES, Buffer.alloc(6)])
  this._send(command)
}

Ccnet.prototype.stack = function () {
  this._send(commands.STACK)
}

Ccnet.prototype.reject = function () {
  this._send(commands.RETURN)
}

Ccnet.prototype.lowestBill = function (fiat) {
  const bills = _.values(this._denominations())
  const filtered = bills.filter(bill => fiat.lte(bill))
  if (_.isEmpty(filtered)) return BN(Infinity)
  return BN(_.min(filtered))
}

Ccnet.prototype.highestBill = function (fiat) {
  const bills = _.values(this._denominations())
  const filtered = bills.filter(bill => fiat.gte(bill))
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
}

Ccnet.prototype.hasDenominations = function () {
  return this._denominations() !== null
}

Ccnet.prototype._denominations = function () {
  return this.denominations
}

Ccnet.prototype._send = function (command) {
  this._stopPolling()
  // timeout because last poll could have been at now minus 1ms
  // potentially sending a new request before getting the response
  setTimeout(() => {
    rs232.request(command)
    this._startPolling()
  }, POLLING_INTERVAL)
}

Ccnet.prototype._connect = function () {
  statesFsm.handle('CONNECT')
}

Ccnet.prototype._startPolling = function () {
  this.pollingInterval = setInterval(() => {
    rs232.request(commands.POLL)
  }, POLLING_INTERVAL)
}

Ccnet.prototype._stopPolling = function () {
  clearInterval(this.pollingInterval)
}

Ccnet.prototype._handleResponse = function (response, command) {
  if (command === commands.GET_BILL_TABLE) {
    return this._billTable(response)
  }

  return statesFsm.handle(respMap[response[0]], response.slice(1), command)
}

/*
  store parsed bill table at this.denominations
*/
Ccnet.prototype._billTable = function (data) {
  const rawLength = data.length
  let index = 0
  this.denominations = {}

  for (var offset = 0; offset < rawLength; offset += 5) {
    const countryCode = String.fromCharCode.apply(null, data.slice(offset + 1, offset + 4))

    const currentIndex = index
    index++

    const denominationInteger = data[offset]
    if (denominationInteger === 0x00) continue

    // first bit represent if value is negative
    const isNegative = readBit(data, offset + 4, 7)
    writeBit(data, offset + 4, 7, 0)
    const denominationExponent = isNegative ? -data[offset + 4] : data[offset + 4]

    const denomination = denominationInteger * Math.pow(10, denominationExponent)
    this.denominations[currentIndex] = denomination
  }
}

function readBit (buffer, i, bit) {
  return (buffer[i] >> bit) % 2
}

function writeBit (buffer, i, bit, value) {
  if (value === 0) {
    buffer[i] &= ~(1 << bit)
  } else {
    buffer[i] |= (1 << bit)
  }
}

module.exports = Ccnet
