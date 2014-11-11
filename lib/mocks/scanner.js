var Parser = require('../../lib/compliance/parsepdf417');
var PairingData = require('../pairingdata');

module.exports = {
  config: config,
  camOn: camOn,
  camOff: camOff,
  scanPairingCode: scanPairingCode,
  scanMainQR: scanMainQR,
  scanPDF417: scanPDF417,
  scanPhotoID: scanPhotoID,
  cancel: cancel
};

var configuration = null;
var _cancelCb = null;

function config(_configuration) {
  configuration = _configuration.mock.data;
}

function camOn() {
}

function camOff(cb) {
  cb();
}

function scanPairingCode(callback) {
  var pairingData = PairingData.process(configuration.pairingData);
  return setTimeout(function () { callback(null, pairingData); }, 500);
}

function scanMainQR(callback) {
  var qrData = configuration.qrData;
  console.log('DEBUG scanning');
  console.dir(configuration);
  _cancelCb = function cancel() {
    callback(null, null);
  };
  return setTimeout(function () {
    callback(null, qrData);
  }, 4000);
}

function scanPDF417(callback) {
  var pdf417Data = configuration.pdf417Data;
  setTimeout(function() { callback(null, Parser.parse(pdf417Data)); }, 800);
}

function scanPhotoID(callback) {
  var fakeLicense = configuration.fakeLicense;
  setTimeout(function() { callback(null, fakeLicense); }, 800);
}

function cancel() {
  if (_cancelCb) _cancelCb();
}
