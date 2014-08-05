'use strict';

var PairingData = require('../pairingdata');

var QrScanner = function (config, data, scanType) {
  if (!(this instanceof QrScanner)) return new QrScanner(config, data, scanType);
  this.data = data;
  this.scanType = scanType;
};

QrScanner.prototype.scan = function scan(cb) {
  if (this.scanType === 'pairing') {
    var pairingData = PairingData.process(this.data);
    return setTimeout(function () { cb(null, pairingData); }, 500);
  }

  var qrCode = this.data;
  return setTimeout(function () { cb(null, qrCode); }, 2000);
};

QrScanner.prototype.clear = function clear() {};

QrScanner.prototype.cancel = function cancel() {};

module.exports = QrScanner;
