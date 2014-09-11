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
var lowExposure;
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
  seret.controlSet(0x9a0901, 1);  // Set exposure to manual
  seret.controlSet(0x9a0902, configuration.lowExposure);  // Set absolute exposure
  seret.controlSet(0x9a0903, 0);  // Turn off auto priority exposure
  seret.startCapture();
}

function camOff(callback) {
  seret.stopCapture();
  seret.cameraOff();
  cam = null;
  imageBuffer = null;
  if (callback) callback();
}

function alternateExposure() {
  var exposure = lowExposure ? configuration.highExposure : configuration.lowExposure;
  lowExposure = !lowExposure;
  seret.controlSet(0x9a0902, exposure);
}

// resultCallback returns final scan result
// captureCallback return result of a frame capture
function scan(resultCallback, captureCallback, alternateExposureFlag) {

  cancelFlag = false;
  var result = null;
  var lastExposure = Date.now();
  var processing = true;
  lowExposure = true;

  function noResult() {
    return processing && !result && !cancelFlag;
  }

  function capture(callback) {
    seret.captureFrame();
    console.log('DEBUG1');
    if (!processing) return callback();

    if (alternateExposureFlag) {
      var now = Date.now();
      if (now - lastExposure > configuration.exposureAdjustTime) {
        alternateExposure();
        lastExposure = now;
      }
    }
    console.log('DEBUG2');

    captureCallback(function(_err, _result) {
      if (_err) return callback(_err);
      if (_result) result = _result;

      // Give node.js time to breath, since seret isn't doing uv_polling yet.
      setTimeout(callback, 10);
    });
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
