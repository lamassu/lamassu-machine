'use strict'

var SerialPort = require('serialport')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var Promise = require('bluebird')
var R = require('ramda')

var puloonData = require('./puloon_data')

// Backwards compatibility with old node-serialport
// Remove this when we upgrade machines to new version
var oldSerialPort = typeof SerialPort === 'object'

var PAUSE_BETWEEN_DISPENSES = 200

var SLIT = 0.785

var ACK = 0x06
var NAK = 0x15
var EOT = 0x04
var SOH = 0x01
var ID = 0x30
var STX = 0x02
var COMMANDS = {
  0x44: {name: 'reset', responseParameters: 0},
  0x52: {name: 'dispense', responseParameters: 22},
  0x50: {name: 'status', responseParameters: 18},
  0x5f: {name: 'billLengths', responseParameters: 8},
  0x5e: {name: 'setBillLengths', responseParameters: 0},
  0x67: {name: 'getSerialNumber', responseParameters: 1}
}

var PuloonRs232 = function (device) {
  this.serial = null
  this.device = device
  this.buffer = new Buffer(0)
  this.setState('idle')
  this.response = null
  this.serialNumber = null
  this.responseCallback = null
}
util.inherits(PuloonRs232, EventEmitter)

PuloonRs232.factory = function factory (device) {
  return new PuloonRs232(device)
}

module.exports = PuloonRs232

PuloonRs232.prototype.open = function open (callback) {
  console.log('INFO Puloon device: ' + this.device)

  var options = {baudRate: 9600, parity: 'even', dataBits: 8, stopBits: 1}
  var serial = oldSerialPort
  ? new SerialPort.SerialPort(this.device, options, false)
  : new SerialPort(this.device, options)

  this.serial = serial

  var self = this
  serial.on('error', function (err) { self.emit('error', err) })
  serial.on('open', function () {
    console.log('INFO puloon connected')
    serial.on('data', function (data) { self._process(data) })
    serial.on('close', function () { self.emit('disconnected') })
    self.emit('connected')
    callback()
  })
}

function findSohIndex (buffer) {
  for (var i = 0; i < buffer.length; i++) {
    if (buffer[i] === SOH) return i
  }
  return -1
}

function parseFrame (buffer) {
  var sohIndex = findSohIndex(buffer)
  if (sohIndex === -1) throw new Error('no SOH')

  // Start frame at SOH
  var frame = buffer.slice(sohIndex)

  // Need to at least pull the command code
  if (frame.length < 4) return null

  if (frame[1] !== ID || frame[2] !== STX) throw new Error('invalid frame')
  var commandCode = frame[3]
  var command = COMMANDS[commandCode]
  if (!command) {
    throw new Error('unsupported command: 0x' + commandCode.toString(16))
  }
  if (frame.length < command.responseParameters + 7) return null

  var rawErrorCode = frame[4] - 0x20
  var errorCode = rawErrorCode === 0 ? null : rawErrorCode
  var res = {
    code: commandCode,
    name: command.name,
    err: errorCode
  }

  // TODO break this out

  if (command.name === 'dispense') {
    res.bills = [
      {accepted: frame[6] - 0x20, rejected: frame[7] - 0x20},
      {accepted: frame[9] - 0x20, rejected: frame[10] - 0x20}
    ]
  }

  if (command.name === 'getSerialNumber') res.serialNumber = frame[5] - 0x20

  return res
}

// Works on both buffers and arrays
function computeBcc (frame) {
  var bcc = 0x00
  for (var i = 0; i < frame.length; i++) {
    bcc = frame[i] ^ bcc
  }
  return bcc
}

function buildFrame (commandCode, parameters) {
  var frame = [0x04, 0x30, 0x02, commandCode]
  frame = frame.concat(parameters, 0x03)
  var bcc = computeBcc(frame)
  frame = frame.concat(bcc)
  var buffer = new Buffer(frame)
  return new Buffer(buffer)
}

PuloonRs232.prototype._processRemaining = function _processRemaining (data, offset) {
  var remaining = data.slice(offset)
  if (remaining.length > 0) {
    var self = this
    process.nextTick(function () { self._process(remaining) })
  }
}

PuloonRs232.prototype._process = function _process (data) {
  if (data.length === 0) return

  // Not sure what this is, but it happens
  if (this.state === 'idle' && data[0] === 0xff) return

  if (this.state === 'waitAck') {
    if (data[0] === ACK) {
      this.setState('waitResponse')
      this._processRemaining(data, 1)
      return
    }
    if (data[0] === NAK) throw new Error('NAK')
  }

  if (this.state === 'waitEOT') {
    if (data[0] === EOT) {
      this.setState('idle')
      this.emit('response', this.response)
      if (this.responseCallback) this.responseCallback(null, this.response)
      this.response = null
      this._processRemaining(data, 1)
      return
    }
  }

  this.buffer = Buffer.concat([this.buffer, data])
  var response = parseFrame(this.buffer)
  if (response === null) return
  this.response = response
  this.buffer = new Buffer(0)

  this.serial.write([ACK])
  this.setState('waitEOT')
}

PuloonRs232.prototype.setState = function setState (state) {
  this.state = state
}

PuloonRs232.prototype._send = function _send (command, name, cb) {
  this.setState('waitAck')
  this.responseCallback = cb || null
  this.serial.write(command)
}

PuloonRs232.prototype.close = function close (cb) {
  var serial = this.serial

  // Workaround for: https://github.com/voodootikigod/node-serialport/issues/241
  setTimeout(function () { serial.close(cb) }, 100)
}

PuloonRs232.prototype._singleDispense = function _singleDispense (notes, delay) {
  this.serialNumber += 1
  var dispenseParams = [0x20 + notes[0], 0x20 + notes[1],
  0x20, 0x20, 0x20, 0x20, 0x20 + this.serialNumber]
  var self = this
  return new Promise(function (resolve, reject) {
    setTimeout(function () {
      self._send(buildFrame(0x52, dispenseParams), 'dispense', function (err, res) {
        if (err) return reject(err)
        if (res.err) {
          var dispenseErr = new Error(res.err)
          dispenseErr.name = 'DispenserError'
          dispenseErr.result = res
          return reject(dispenseErr)
        }
        resolve(res)
      })
    }, delay ? PAUSE_BETWEEN_DISPENSES : 0)
  })
}

function max (numArray) {
  return Math.max.apply(null, numArray)
}

PuloonRs232.prototype.dispense = function dispense (notes, cb) {
  var self = this
  var currentNotes = notes
  var remainingNotes = notes
  var noteSequence = []

  while (true) {
    currentNotes = remainingNotes.map(function (n) { return Math.min(20, n) })
    remainingNotes = R.zipWith(R.subtract, remainingNotes, currentNotes)

    if (max(currentNotes) === 0) break
    noteSequence.push(currentNotes)
  }

  var results = []

  var current = Promise.resolve()
  noteSequence.forEach(function (notes, idx) {
    current = current.then(function () {
      return self._singleDispense(notes, idx > 0)
      .then(function (res) {
        results.push(res)
        return results
      })
    })
  })

  return current
  .then(function (res) {
    return aggregateDispensed(res)
  })
  .catch(function (e) {
    results.push(e.result)
    var res = aggregateDispensed(results)
    res.err = e.message
    return res
  })
  .nodeify(cb)
}

function addBillRecs (a, b) {
  return {
    accepted: a.accepted + b.accepted,
    rejected: a.rejected + b.rejected
  }
}

function aggregateDispensed (arr) {
  return arr.reduce(function (acc, r) {
    return {
      bills: R.zipWith(addBillRecs, acc.bills, r.bills),
      code: [].concat(acc.code, r.code),
      name: [].concat(acc.name, r.name)
    }
  })
}

PuloonRs232.prototype.reset = function reset (cartridges, currency, cb) {
  // Note: Puloon sends two identical responses for reset command,
  // one before motor reset, and one after.

  var responseCount = 0
  var self = this
  this._send(buildFrame(0x44, []), 'reset', function () {
    responseCount += 1
    if (responseCount < 2) return
    self._getSerialNumber(function (err, serialNumber) {
      if (err) { return cb(err) }
      self.serialNumber = serialNumber
      self._setBillLengths(cartridges, currency, cb)
    })
  })
}

PuloonRs232.prototype._getSerialNumber = function _getSerialNumber (cb) {
  this._send(buildFrame(0x67, []), 'getSerialNumber', function (err, res) {
    cb(err, res.serialNumber)
  })
}

function billLengthData (cartridges, currency) {
  var numCartridges = cartridges.length
  if (numCartridges > 4) throw new Error('Too many cartridges')
  var billLengths = puloonData.billLengths[currency]
  if (!billLengths) throw new Error('Unsupported currency: ' + currency)
  var data = [0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30]
  for (var i = 0; i < numCartridges; i++) {
    var cartridge = cartridges[i]
    var billLength = billLengths[cartridge.denomination]
    if (!billLength) {
      throw new Error('Unsupported denomination: ' + cartridge.denomination + ' for currency: ' + currency)
    }
    var adjustedBillLength = Math.floor(billLength / SLIT)
    var index = i * 2
    data[index] = (Math.floor(adjustedBillLength / 16) + 0x30)
    data[index + 1] = ((adjustedBillLength % 16) + 0x30)
  }

  return data
}

PuloonRs232.prototype._setBillLengths = function _setBillLengths (cartridges,
currency, cb) {
  var data = billLengthData(cartridges, currency)
  this._send(buildFrame(0x5e, data), 'setBillLengths', function (err) {
    cb(err)
  })
}
