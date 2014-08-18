'use strict';

var serialPort = require('serialport');
var SerialPort = serialPort.SerialPort;
var EventEmitter = require('events').EventEmitter;
var util = require('util');

var ACK = 0x06;
var NAK = 0x15;
var EOT = 0x04;
var SOH = 0x01;
var ID = 0x30;
var STX = 0x02;
var COMMANDS = {
  0x44: {name: 'reset', responseParameters: 0}, 
  0x52: {name: 'dispense', responseParameters: 22},
  0x50: {name: 'status', responseParameters: 18},
  0x5f: {name: 'billLengths', responseParameters: 8},
  0x5e: {name: 'setBillLengths', responseParameters: 0},
  0x67: {name: 'getSerialNumber', responseParameters: 1}
};

var PuloonRs232 = function(device) {
  this.serial = null;
  this.device = device;
  this.buffer = new Buffer(0);
  this.setState('idle');
  this.response = null;
  this.serialNumber = null;
  this.responseCallback = null;
};
util.inherits(PuloonRs232, EventEmitter);

PuloonRs232.factory = function factory(device) {
  return new PuloonRs232(device);
};

PuloonRs232.prototype.open = function open(callback) {
  console.log(this.device); // DEBUG
  var serial = new SerialPort(this.device, 
      {baudRate: 9600, parity: 'even', dataBits: 8, stopBits: 1});

  this.serial = serial;

  var self = this;
  serial.on('error', function(err) { self.emit('error', err); });
  serial.on('open', function () {
    serial.on('data', function(data) {  self._process(data); });
    serial.on('close', function() { self.emit('disconnected'); });
    self.emit('connected');
    if (callback) callback(function () {
      self.close();
    });
  });
};

function findSohIndex(buffer) {
  for (var i = 0; i < buffer.length; i++) {
    if (buffer[i] === SOH) return i;
  }
  return -1;
}

function parseFrame(buffer) {
  var sohIndex = findSohIndex(buffer);
  if (sohIndex === -1) throw new Error('no SOH');

  // Start frame at SOH
  var frame = buffer.slice(sohIndex);

  // Need to at least pull the command code
  if (frame.length < 4) return null;
  
  if (frame[1] !== ID || frame[2] !== STX) throw new Error('invalid frame');
  var commandCode = frame[3];
  var command = COMMANDS[commandCode];
  if (!command) throw new Error('unsupported command: 0x' + commandCode.toString(16));
  if (frame.length < command.responseParameters + 7) return null;

  var res = {code: commandCode, name: command.name};

  // TODO break this out
  if (command.name === 'getSerialNumber') res.serialNumber = frame[5] - 0x20;

  return res; 
}

// Works on both buffers and arrays
function computeBcc(frame) {
  var bcc = 0x00;
  for (var i = 0; i < frame.length; i++) {
    bcc = frame[i] ^ bcc;
  }
  return bcc;
}

function buildFrame(commandCode, parameters) {
  var frame = [0x04, 0x30, 0x02, commandCode];
  frame = frame.concat(parameters, 0x03);
  var bcc = computeBcc(frame);
  frame = frame.concat(bcc);
  var buffer = new Buffer(frame);
  console.log(buffer.toString('hex'));
  return new Buffer(buffer);
}

PuloonRs232.prototype._processRemaining = function _processRemaining(data, offset) {
  var remaining = data.slice(offset);
  if (remaining.length > 0) {
    var self = this;
    process.nextTick(self._process(remaining));
  }
};

PuloonRs232.prototype._process = function _process(data) {
  if (data.length === 0) return;
  console.log('incoming data');
  console.log(data.toString('hex'));

  // Not sure what this is, but it happens
  if (this.state === 'idle' && data[0] === 0xff) return;

  if (this.state === 'waitAck') {
    if (data[0] === ACK) {
      this.setState('waitResponse');
      this._processRemaining(data, 1);
      return;
    }
    if (data[0] === NAK) throw new Error('NAK');
  }

  if (this.state === 'waitEOT') {
    if (data[0] === EOT) {
      this.setState('idle');
      this.emit('response', this.response);
      console.log('DEBUG EOT');
      if (this.responseCallback) this.responseCallback(null, this.response);
      this.response = null;
      this._processRemaining(data, 1);
      return;
    }    
  }

  this.buffer = Buffer.concat([this.buffer, data]);
  var response = parseFrame(this.buffer);
  if (response === null) return;
  this.response = response;
  this.buffer = new Buffer(0);

  this.serial.write([ACK]);
  this.setState('waitEOT');
};

PuloonRs232.prototype.setState = function setState(state) {
  this.state = state;
  console.log('set state to: %s', state);
};

PuloonRs232.prototype._send = function _send(command, name, cb) {
  console.log('sending command: %s', name);
  this.setState('waitAck');
  this.responseCallback = cb || null;
  this.serial.write(command);
};

PuloonRs232.prototype.close = function close(cb) {
  console.log('DEBUG close puloonRs232');
  var serial = this.serial;

  // Workaround for: https://github.com/voodootikigod/node-serialport/issues/241
  setTimeout(function () { serial.close(cb); }, 100);
};

PuloonRs232.prototype.dispense = function dispense(notes, cb) {
  this.serialNumber += 1;
  var dispenseParams = [0x20 + notes[0], 0x20 + notes[1], 
    0x20, 0x20, 0x20, 0x20, 0x20 + this.serialNumber];
  console.dir(dispenseParams);
  this._send(buildFrame(0x52, dispenseParams), 'dispense', cb);
};

PuloonRs232.prototype.reset = function reset(cb) {
  // Note: Puloon sends two identical responses for reset command,
  // one before motor reset, and one after.

  var responseCount = 0;
  var self = this;
  this._send(buildFrame(0x44, []), 'reset', function () {
    responseCount += 1;
    if (responseCount < 2) return;
    self._getSerialNumber(function (err, serialNumber) {
      self.serialNumber = serialNumber;
      console.log('DEBUG serialNumber: %d', self.serialNumber);
      cb();
    });
  });
};

PuloonRs232.prototype._getSerialNumber = function _getSerialNumber(cb) {
  this._send(buildFrame(0x67, []), 'getSerialNumber', function (err, res) {
    cb(err, res.serialNumber);
  });
};

// TODO Harcoded for Euros, generalize
PuloonRs232.prototype._setBillLengths = function _setBillLengths(cb) {
  // EURO 5,20 var data = [0x39, 0x38, 0x3a, 0x39, 0x3c, 0x36, 0x3c, 0x36]; 
  var data = [0x3a, 0x3b, 0x3b, 0x3d, 0x3c, 0x36, 0x3c, 0x36]; // GBP 5, 20
  this._send(buildFrame(0x5e, data), 'setBillLengths', function (err) {
    cb(err);
  });
};

module.exports = PuloonRs232;

/*
var notes1 = parseInt(process.argv[2]);
var notes2 = parseInt(process.argv[3]);
var serialNumber = parseInt(process.argv[4]);
var serialDevice = '/dev/tty.NoZAP-PL2303-00001014';
var puloonRs232 = PuloonRs232.factory({device: serialDevice});
puloonRs232.serialNumber = serialNumber;
puloonRs232.open(function () {
  var RESET = new Buffer([0x04, 0x30, 0x02, 0x44, 0x03, 0x71]);
  //puloonRs232._send(RESET, 'reset');
  //puloonRs232._send(buildFrame(0x5e, [0x39, 0x38, 0x3a, 0x39, 0x3c, 0x36, 0x3c, 0x36]), 'setBillLengths');  

US=-0xc6
5 = 0x98
20 = 0xa9
  //puloonRs232._send(buildFrame(0x5f, []), 'billLengths');  
  puloonRs232.dispense([notes1, notes2, 0, 0]);
});

puloonRs232.on('response', function () {
//  this.close(function() { console.log('done.'); });
//  if (response.name === 'reset') resetCount++;
//  if (response.name === 'reset' && resetCount === 2) {
//  }
//    serialNumber++;
//    var dispenseParams = [0x20 + notes, 0x20, 0x20, 0x20, 0x20, 0x20, serialNumber];
//    return puloonRs232.send(buildFrame(0x52, dispenseParams), 'dispense');
});

setTimeout(function () {}, 5000);
*/
