var seret = require('seret');
var manatee = require('manatee');
var supyo = require('supyo');
var Jpeg = require('jpeg');
var async = require('async');
var bitcoinAddressValidator = require ('bitcoin-address');
var PairingData = require('./pairingdata');
var Pdf417Parser = require('./compliance/parsepdf417');

var configuration = null;
var cam = null;
var width;
var height;
var cancelFlag = false;
var imageBuffer = null;

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

function config(_configuration) {
  configuration = _configuration;
  var licenses = configuration.manatee.license;
  manatee.register('qr', licenses.qr.name, licenses.qr.key);
  manatee.register('pdf417', licenses.pdf417.name, licenses.pdf417.key);
}

function cancel() {
  cancelFlag = true;
}

function camOn() {
  width = configuration.width;
  height = configuration.height;
  imageBuffer = new Buffer(width * height);

  seret.cameraOn(configuration.device, imageBuffer, width, height);
  seret.controlSet(0x980901, configuration.contrast);
  seret.startCapture();
}

function camOff(callback) {
  seret.stopCapture();
  seret.cameraOff();
  cam = null;
  imageBuffer = null;
  if (callback) callback();
}

// resultCallback returns final scan result
// captureCallback return result of a frame capture
function scan(resultCallback, captureCallback) {

  cancelFlag = false;
  var result = null;
  var processing = true;

  function noResult() {
    return processing && !result && !cancelFlag;
  }

  function handleCapture(callback) {
    if (!processing) return callback();

    captureCallback(function(_err, _result) {
      if (_result) {
        result = _result;
        callback(_err);
      }
      setTimeout(function() { callback(_err); }, 100);
    });
  }

  function capture(callback) {
    seret.captureFrame(function() { handleCapture(callback); });
  }

  async.whilst(noResult, capture, function(err) {
    cancelFlag = false;
    var doCallback = processing;
    processing = false;
    if (doCallback) resultCallback(err, result);
  });
}

function scanQR(callback) {
  scan(callback, function(_callback) {
    var result = manatee.scanQR(imageBuffer, width, height);
    if (!result) return _callback();
    _callback(null, result.toString());
  }, true);
}

var fs = require('fs');
function scanPDF417(callback) {
  scan(callback, function(_callback) {
    var result = manatee.scanPDF417(imageBuffer, width, height);
    if (!result) return _callback(null, null);
    var parsed = Pdf417Parser.parse(result);
    if (!parsed) return _callback(null, null);
    _callback(null, parsed);
  });
}

function scanPhotoID(callback) {
  scan(callback, function(_callback) {
    var detected = supyo.detect(imageBuffer, width, height);
    if (!detected) return _callback();
    var rgb = seret.toRGB();
    var jpeg = new Jpeg(rgb, width, height);
    jpeg.encode(function(jpegEncoded, _err) {
      if (_err) return _callback(_err);
      var result = jpegEncoded;
      _callback(null, result);
    });
  });
}

function scanPairingCode(callback) {
  scanQR(function (err, result) {
    if (err) return callback(err);
    if (!result) return callback(null, null);
    callback(null, PairingData.process(result.toString()));
  });
}

function scanMainQR(callback) {
  scanQR(function (err, result) {
    if (err) return callback(err);
    if (!result) return callback(null, null);
    callback(null, processBitcoinURI(result.toString()));
  });
}

function processBitcoinURI(data) {
  var address = parseBitcoinURI(data);
  if (!address) return null;
  if (!bitcoinAddressValidator.validate(address)) {
    console.log('Invalid bitcoin address: %s', address);
    return null;
  }
  return address;
}

function parseBitcoinURI(uri) {
  var res = /^(bitcoin:\/{0,2})?(\w+)/.exec(uri);
  var address = res && res[2];
  if (!address) {
    return null;
  } else return address;
}
