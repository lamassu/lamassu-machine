'use strict'

var SerialPort = require('serialport')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var _ = require('lodash/fp')

var puloonData = require('./puloon_data')

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
  this.buffer = Buffer.from([])
  this.setState('idle')
  this.response = null
  this.serialNumber = null
  this.responseCallback = null
  this.retrySentCommand = null
}
util.inherits(PuloonRs232, EventEmitter)

PuloonRs232.factory = function factory (device) {
  return new PuloonRs232(device)
}

module.exports = PuloonRs232

PuloonRs232.prototype.open = function open (callback) {
  console.log('INFO Puloon device: ' + this.device)

  var options = {baudRate: 9600, parity: 'even', dataBits: 8, stopBits: 1}
  var serial = new SerialPort(this.device, options)

  this.serial = serial

  var self = this
  serial.on('error', function (err) { self.emit('error', err) })
  serial.on('open', function () {
    console.log('INFO puloon connected')
    serial.on('readable', function () { self._process(serial.read()) })
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
      {dispensed: frame[6] - 0x20, rejected: frame[7] - 0x20},
      {dispensed: frame[9] - 0x20, rejected: frame[10] - 0x20}
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

function logBufferFrame (data) {
  return JSON.stringify(Buffer.from(data).toJSON().data)
}

function buildFrame (commandCode, parameters) {
  var frame = [0x04, 0x30, 0x02, commandCode]
  frame = frame.concat(parameters, 0x03)
  var bcc = computeBcc(frame)
  frame = frame.concat(bcc)
  var buffer = Buffer.from(frame)
  console.log(`PULOON | Sending frame data: ${logBufferFrame(Buffer.from(buffer))}`)
  return Buffer.from(buffer)
}

PuloonRs232.prototype._processRemaining = function _processRemaining (data, offset) {
  var remaining = data.slice(offset)
  if (remaining.length > 0) {
    var self = this
    process.nextTick(function () { self._process(remaining) })
  }
}

PuloonRs232.prototype._process = function _process (data) {
  console.log(`PULOON | Processing response: ${logBufferFrame(data)}`)
  if (data.length === 0) return

  // Not sure what this is, but it happens
  if ((this.state === 'idle' || this.state === 'waitAck' || this.state === 'waitEOT') &&
    data[0] === 0xff) return // Should handle no SOH exception

  if (this.state === 'waitAck') {
    if (data[0] === ACK) {
      clearTimeout(this.retrySentCommand)
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
  this.buffer = Buffer.from([])

  this.serial.write([ACK])
  this.setState('waitEOT')
}

PuloonRs232.prototype.setState = function setState (state) {
  console.log(`PULOON | STATE -> ${state}`)
  this.state = state
}

PuloonRs232.prototype._send = function _send (command, name, withRetry, cb) {
  this.setState('waitAck')
  this.responseCallback = cb || null
  this.serial.write(command)
  if (withRetry) {
    this.retrySentCommand = setTimeout(() => this.serial.write(command), 5000)
  }
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
      console.log(`PULOON | CMD -> dispense`)
      self._send(buildFrame(0x52, dispenseParams), 'dispense', false, function (err, res) {
        if (err) return reject(err)
        if (res.err) {
          console.log('error outline', res.err)
          var dispenseErr = new Error(`Dispensing, code: ${res.err}`)
          res.error = dispenseErr
          console.log('PULOON | dispense error 1', dispenseErr)
          return resolve(res)
        }
        resolve(res)
      })
    }, delay ? PAUSE_BETWEEN_DISPENSES : 0)
  })
}

function max (numArray) {
  return Math.max.apply(null, numArray)
}

PuloonRs232.prototype.dispense = function dispense (notes) {
  var self = this
  var currentNotes = notes
  var remainingNotes = notes
  var noteSequence = []
  var results = []
  var error = null

  console.log('PULOON | dispense debug 1', notes)

  return new Promise(resolve => {
    var current = Promise.resolve()

    while (true) {
      currentNotes = remainingNotes.map(function (n) { return Math.min(20, n) })
      remainingNotes = _.zipWith(_.subtract, remainingNotes, currentNotes)

      if (max(currentNotes) === 0) break
      noteSequence.push(currentNotes)
    }

    let shouldBreak = false

    for (let i = 0; i < noteSequence.length; i++) {
      if (shouldBreak) break
      const notes = noteSequence[i]
      current = current.then(() => {
        return self._singleDispense(notes, i > 0)
          .then(function (res) {
            if (res.error) {
              shouldBreak = true
              error = res.error
            }
            results.push(res)
            return { results, error }
          })
      })
    }

    resolve(current)
  })
    .then(function ({ results, error }) {
      return aggregateDispensed(results, error)
    })
    .catch(function (e) {
      console.log('dispense error2', e.message)
      throw e
    })
}

function addBillRecs (a, b) {
  return {
    dispensed: a.dispensed + b.dispensed,
    rejected: a.rejected + b.rejected
  }
}

function aggregateDispensed (results, error) {
  if (!_.size(results)) {
    return {
      bills: [
        {dispensed: 0, rejected: 0},
        {dispensed: 0, rejected: 0}
      ],
      code: [],
      name: [],
      error
    }
  }

  return results.reduce(function (acc, r) {
    return {
      bills: _.zipWith(addBillRecs, acc.bills, r.bills),
      code: [].concat(acc.code, r.code),
      name: [].concat(acc.name, r.name),
      error
    }
  })
}

PuloonRs232.prototype.reset = function reset (cassettes, fiatCode, cb) {
  // Note: Puloon sends two identical responses for reset command,
  // one before motor reset, and one after.
  console.log(`PULOON | CMD -> reset`)
  var responseCount = 0
  var self = this
  this._send(buildFrame(0x44, []), 'reset', true, function () {
    responseCount += 1
    if (responseCount < 2) return
    self._getSerialNumber(function (err, serialNumber) {
      if (err) { return cb(err) }
      self.serialNumber = serialNumber
      self._setBillLengths(cassettes, fiatCode, cb)
    })
  })
}

PuloonRs232.prototype._getSerialNumber = function _getSerialNumber (cb) {
  console.log(`PULOON | CMD -> getSerialNumber`)
  this._send(buildFrame(0x67, []), 'getSerialNumber', true, function (err, res) {
    cb(err, res.serialNumber)
  })
}

PuloonRs232.prototype.updateSerialNumber = function updateSerialNumber (cb) {
  var self = this
  console.log(`PULOON | CMD -> updateSerialNumber`)
  this._getSerialNumber(function (err, serialNumber) {
    if (err) { return cb(err) }
    self.serialNumber = serialNumber
    cb()
  })
}

function billLengthData (cassettes, fiatCode) {
  var numCassettes = cassettes.length
  if (numCassettes > 4) throw new Error('Too many cassettes')
  var billLengths = puloonData.billLengths[fiatCode]
  if (!billLengths) throw new Error('Unsupported fiatCode: ' + fiatCode)
  var data = [0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30, 0x30]
  for (var i = 0; i < numCassettes; i++) {
    var cassette = cassettes[i]
    var billLength = billLengths[cassette.denomination]
    if (!billLength) {
      throw new Error('Unsupported denomination: ' + cassette.denomination + ' for fiatCode: ' + fiatCode)
    }
    var adjustedBillLength = Math.floor(billLength / SLIT)
    var index = i * 2
    data[index] = (Math.floor(adjustedBillLength / 16) + 0x30)
    data[index + 1] = ((adjustedBillLength % 16) + 0x30)
  }

  return data
}

PuloonRs232.prototype._setBillLengths = function _setBillLengths (cassettes, fiatCode, cb) {
  var data = billLengthData(cassettes, fiatCode)
  console.log(`PULOON | CMD -> setBillLengths`)
  this._send(buildFrame(0x5e, data), 'setBillLengths', true, function (err) {
    cb(err)
  })
}
