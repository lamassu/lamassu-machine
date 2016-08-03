'use strict'

var SerialPort = require('serialport')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var fs = require('fs')
var async = require('async')
var Crc = require('./crc')

// Backwards compatibility with old node-serialport
// Remove this when we upgrade machines to new version
var oldSerialPort = typeof SerialPort === 'object'

var Id003Rs232 = function (config, denominations) {
  EventEmitter.call(this)
  this.currency = config.currency
  this.buf = new Buffer(0)
  this.responseSize = null
  this.config = config
  this.serial = null
  this.denominations = denominations
  this.commands = []
}

util.inherits(Id003Rs232, EventEmitter)
Id003Rs232.factory = function factory (config, denominations) {
  return new Id003Rs232(config, denominations)
}

var SYNC = 0xfc

// TODO: handle comm errors
var CMD = {
  denominations: [0x8a],
  status: [0x11],
  stack: [0x41],
  ack: [0x50],
  inhibit: [0xc3, 0x01],
  unInhibit: [0xc3, 0x00],
  reset: [0x40],
  reject: [0x43],
  enableAll: [0xc0, 0x00, 0x00],
  getEnabled: [0x80],
  interruptMode: [0xc2, 0x01]
}

var RSP = {
  0x05: 'enq',
  0x40: 'powerUp',
  0x1b: 'initialize',
  0x1a: 'disable',
  0x11: 'enable',
  0x12: 'accepting',
  0x13: 'escrow',
  0x14: 'stacking',
  0x15: 'vendValid',
  0x16: 'stacked',
  0x17: 'rejecting',
  0x18: 'returning',
  0x43: 'stackerFull',
  0x44: 'stackerOpen',
  0x45: 'acceptorJam',
  0x46: 'stackerJam',
  0x47: 'pause',
  0x48: 'cheated',
  0x49: 'failure',
  0x4b: 'invalid',
  0x50: 'ack',
  0x80: 'getEnabled',
  0x88: 'version',
  0x8a: 'denominations',
  0xc0: 'setEnabled',
  0xc2: 'commMode',
  0xc3: 'inhibit'
}

var REJECTION_REASONS = {
  0x71: 'insertion',
  0x72: 'mug',
  0x73: 'head',
  0x74: 'calibration',
  0x75: 'conveying',
  0x76: 'discrimination',
  0x77: 'photoPattern',
  0x78: 'photoLevel',
  0x79: 'inhibit',
  0x7a: 'unknown',
  0x7b: 'operation',
  0x7c: 'stacker',
  0x7d: 'length',
  0x7e: 'photoPattern',
  0x7f: 'trueBill'
}

Id003Rs232.prototype._open = function _open (device, cb) {
  var self = this
  var options = {
    baudRate: 9600,
    parity: 'even',
    dataBits: 8,
    bufferSize: 10,
    stopBits: 1,
    autoOpen: false
  }

  var serial = oldSerialPort
  ? new SerialPort.SerialPort(device, options, false)
  : new SerialPort(device, options)

  this.serial = serial

  serial.on('error', function (err) { self.emit('error', err) })
  serial.on('open', function (err) {
    if (err) return cb(err)
    serial.on('data', function (data) { self._process(data) })
    serial.on('close', function () {
      self.emit('disconnected')
    })
    self.lightOff()
    cb()
  })

  serial.open()
}

Id003Rs232.prototype.open = function open (cb) {
  var self = this

  var devices = this.config.device
  if (!devices) {
    this.emit('error', 'No configured devices.')
    return
  }

  if (typeof (devices) === 'string') return this._open(devices, cb)

  // Note: We're using detectSeries because we want to conserve device order,
  // meaning we want to use the first devices in the list that's present.
  async.detectSeries(devices, function (device, _cb) {
    fs.stat(device, function (err, stats) {
      if (err) return _cb(false)
      if (!stats.isCharacterDevice()) return _cb(false)
      _cb(true)
    })
  }, function (device) {
    if (device) return self._open(device, cb)
    self.emit('error', 'No configured devices available.')
  })
}

Id003Rs232.prototype.send = function send (command) {
  if (command !== 'status') console.log('DEBUG100: %s', command)
  var codes = CMD[command]
  if (!codes) throw new Error('Invalid command: ' + command)
  var length = codes.length + 4
  var payload = [SYNC].concat(length, codes)
  var buf = new Buffer(payload)
  var crc = Crc.compute(payload)
  var crcBuf = new Buffer(2)
  crcBuf.writeUInt16LE(crc, 0)
  var outBuf = Buffer.concat([buf, crcBuf], length)
  this.serial.write(outBuf)
}

Id003Rs232.prototype.close = function close (cb) {
  this.serial.close(cb)
}

Id003Rs232.prototype.lightOn = function lightOn () {
  var serial = this.serial

  serial.set({rts: true}, function (err) {
    if (err) console.log('lightOn failed: %s', err)
  })
}

Id003Rs232.prototype.lightOff = function lightOff () {
  var serial = this.serial

  serial.set({rts: false}, function (err) {
    if (err) console.log('lightOff failed: %s', err)
  })
}

Id003Rs232.prototype._acquireSync = function _acquireSync (data) {
  var payload = null
  for (var i = 0; i < data.length; i++) {
    if (data[i] === SYNC) {
      payload = data.slice(i)
      break
    }
  }

  return (payload || new Buffer(0))
}

Id003Rs232.prototype._crcVerify = function _crcVerify (payload) {
  var payloadCrc = payload.readUInt16LE(payload.length - 2)
  var verify = Crc.compute(payload.slice(0, -2)) === payloadCrc
  if (!verify) throw new Error('CRC error')
}

Id003Rs232.prototype._parse = function _parse (packet) {
  this._crcVerify(packet)
  var data = packet.length === 5 ? null : packet.slice(3, -2)
  var commandCode = packet[2]
  this._interpret(commandCode, data)
}

Id003Rs232.prototype._interpret = function _interpret (commandCode, rawData) {
  var command = RSP[commandCode]

  if (command !== 'disable' && command !== 'enable') {
    console.log('DEBUG101: %s, 0x%s, %s', command, commandCode.toString(16), rawData && rawData.toString('hex'))
  }

  if (!command) {
    this.emit('unknownCommand', commandCode)
    return
  }

  var data = this._parseData(command, rawData)
  this.emit('message', command, data)
}

Id003Rs232.prototype._parseData = function _parseData (command, rawData) {
  switch (command) {
    case 'escrow': return this._escrow(rawData)
    case 'version': return this._version(rawData)
    case 'rejecting': return this._rejecting(rawData)
    case 'denominations': return this._denominations(rawData)
    case 'getEnabled':
    case 'setEnabled': return this._enabled(rawData)
    default: return null
  }
}

Id003Rs232.prototype._escrow = function _escrow (rawData) {
  var currencyCode = rawData[0]
  var denomination = this.denominations[currencyCode]
  return {denomination: denomination, code: currencyCode}
}

Id003Rs232.prototype._rejecting = function _rejecting (rawData) {
  var code = rawData[0]
  var reason = REJECTION_REASONS[code]
  return {reason: reason, code: code}
}

Id003Rs232.prototype._denominations = function _denominations (rawData) {
  // TODO: add in currency tables to support multiple currencies at once
  // Last two bytes are boot version
  if (this.denominations) return
  this.denominations = {}
  var rawLength = rawData.length
  for (var offset = 0; offset < rawLength; offset += 4) {
    var escrowCode = rawData[offset]
    var denominationInteger = rawData[offset + 2]
    if (denominationInteger === 0x00) continue
    var denominationExponent = rawData[offset + 3]
    var denomination = denominationInteger * Math.pow(10, denominationExponent)
    this.denominations[escrowCode] = denomination
  }
}

Id003Rs232.prototype._enabled = function _enabled (rawData) {
  return {data1: rawData[0], data2: rawData[1]}
}

Id003Rs232.prototype._version = function _version (rawData) {
  this.crcVerify(rawData)
  return {version: rawData.slice(0, -2)}
}

Id003Rs232.prototype._process = function _process (data) {
  this.buf = Buffer.concat([this.buf, data])
  while (this._processPacket()) {}
}

Id003Rs232.prototype._processPacket = function _processPacket () {
  if (this.buf.length === 0) return
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
    console.dir(ex)
    console.log(ex.stack)
    this.emit('badFrame')
    return false
  }

  return true
}

module.exports = Id003Rs232
