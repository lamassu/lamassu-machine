'use strict';

var Zbar = require('zbar');
var bitcoinAddressValidator = require ('bitcoin-address');
var cp = require('child_process');
var PairingData = require('./pairingdata');

var ZBAR_OPTIONS = {
  width: 320,
  height: 240,
  symbology: [ 'qrcode.enable' ]
};

var QrScanner = function(config, scanType) {
  this.config = config;
  this.device = config.device;
  this.zbar = null;
  this.string = '';
  this.viewer = null;

  // This is a temporary thing anyway, until we move to Manatee,
  // so might as well keep backwards compatibility
  this.scanType = scanType || 'bitcoinAddress';
};

QrScanner.factory = function factory(config, scanType) {
  return new QrScanner(config, scanType);
};

QrScanner.prototype.view = function view() {
  this.viewer = cp.exec('DISPLAY=:0 /usr/bin/zbarcam --prescale=640x480', console.log);
  setTimeout(function() { cp.exec('killall zbarcam'); }, 120000);
};

QrScanner.prototype.clear = function clear() {
  cp.exec('killall zbarcam');
};

QrScanner.prototype.scan = function scan(cb) {
  console.log('Connecting to camera at ' + this.config.device);
  if (this.zbar) console.log('WARNING: zbar is active!');

  // TODO: check for connection error
  this.zbar = new Zbar(this.device, ZBAR_OPTIONS);
  var self = this;
  var errString = '';

  this.zbar.stdout.on('data', function(chunk) {
    self.string = self.string + chunk.toString();
    var lastChar = self.string[self.string.length - 1];
    if (lastChar === '\n') {
      var data = self.string.slice(0, -1);
      self.string = '';
      var result = self.scanType === 'bitcoinAddress' ?
        self._processBitcoinURI(data) :
        self._processPairing(data);

      if (result === null) return;
      cb(null, result);
      self.cancel();
    }
  });

  this.zbar.stderr.on('data', function(chunk) {
    errString = errString + chunk.toString();
  });

  this.zbar.on('exit', function(code) {
    if (code !== 0 && code !== null) {
      console.log('ERROR: zbarcam error: %d, check that the device is registered', code);
      console.log(errString);
    }
  });
};

QrScanner.prototype._processPairing = function _processPairing(data) {
  return PairingData.process(data);
};

QrScanner.prototype._processBitcoinURI = function _processBitcoinURI(data) {
  var address = this._parseBitcoinURI(data);
  if (!address) return null;
  if (!bitcoinAddressValidator.validate(address)) {
    console.log('invalid bitcoin address: %s', address);
    return null;
  }
  return address;
};

QrScanner.prototype.cancel = function cancel() {
  if (this.zbar) this.zbar.kill();
  this._reset();
};

QrScanner.prototype._parseBitcoinURI = function _parseBitcoinURI(uri) {
  var res = /^(bitcoin:\/{0,2})?(\w+)/.exec(uri);
  var address = res && res[2];
  if (!address) {
    return null;
  } else return address;
};

QrScanner.prototype._reset = function _reset() {
  this.zbar = null;
  this.string = '';
};

module.exports = QrScanner;
