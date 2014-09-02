var seret = require('seret');
var manatee = require('manatee');
var supyo = require('supyo');
var Jpeg = require('jpeg');
var async = require('async');
var bitcoinAddressValidator = require ('bitcoin-address');
var PairingData = require('./pairingdata');
var Pdf417Parser = require('./compliance/parsepdf417');
var _ = require('lodash');

var configuration = null;
var cam = null;
var width;
var height;
var cancelFlag = false;
var darkExposure;

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
  cam = new seret.Camera(configuration.device);
  width = configuration.width;
  height = configuration.height;
  cam.configSet({width: width, height: height});

  var controls = cam.controls;
  var contrastControl = _.first(_.where(controls, {name: 'Contrast'}));
  var contrast = config.contrast;
  cam.controlSet(contrastControl.id, contrast);

  cam.controlSet(0x9a0901, 1);      // Set exposure to manual
  cam.controlSet(0x9a0902, 15);    // Set absolute exposure
  cam.controlSet(0x9a0903, 0);      // Turn off auto priority exposure
  cam.start();
}

function camOff() {
  cam.stop();
  cam = null;
}

function alternateExposure() {
  var exposure = darkExposure ? 50 : 15;
  darkExposure = !darkExposure;
  cam.controlSet(0x9a0902, exposure);
}

// resultCallback returns final scan result
// captureCallback return result of a frame capture
function scan(resultCallback, captureCallback, alternateExposureFlag) {

  cancelFlag = false;
  var result = null;
  var lastExposure = Date.now();
  darkExposure = true;
  cam.controlSet(0x9a0902, 15);

  function noResult() {
    return !result && !cancelFlag;
  }

  function capture(callback) {
    cam.capture(function (success) {
      if (!success) return callback();

      if (alternateExposureFlag) {
        var now = Date.now();
        if (now - lastExposure > 200) alternateExposure();
        lastExposure = now;
      }

      captureCallback(function(_err, _result) {
        if (_err) return callback(_err);
        if (_result) result = _result;
        callback();
      });
    });
  }

  async.whilst(noResult, capture, function(err) {
    cancelFlag = false;
    resultCallback(err, result);
  });
}

function scanQR(callback) {
  scan(callback, function(_callback) {
    var image = cam.toGrey();
    var result = manatee.scanQR(image, width, height);
    if (!result) return _callback();
    _callback(null, result.toString());
  }, true);
}

function scanPDF417(callback) {
  scan(callback, function(_callback) {
    var image = cam.toGrey();
    var result = manatee.scanPDF417(image, width, height);
    if (!result) return _callback();
    var parsed = Pdf417Parser.parse(result);
    if (!parsed) return _callback();
    _callback(null, parsed);
  });
}

function scanPhotoID(callback) {
  scan(callback, function(_callback) {
    var image = cam.toGrey();
    var detected = supyo.detect(image, width, height);
    if (!detected) return _callback();
    var rgb = cam.toRGB();
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
