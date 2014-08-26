var seret = require('seret');
var manatee = require('manatee');
var supyo = require('supyo');
var Png = require('png');
var async = require('async');

var configuration = null;
var cam = null;
var width;
var height;

module.exports = {
  config: config,
  scanQR: scanQR,
  scanPDF417: scanPDF417,
  scanPhotoID: scanPhotoID
};

function config(_configuration) {
  configuration = _configuration;
  cam = new seret.Camera(configuration.device);
  width = configuration.width;
  height = configuration.height;
  cam.configSet({width: width, height: height});
}

function scanQR(callback) {
  var result = null;
  var t0 = Date.now();

  function noResult() {
    var timeout = Date.now() - t0 > configuration.timeout;
    return !result && !timeout;
  }

  function capture(_callback) {
    cam.capture(function (err) {
      if (err) return _callback(err);
      var image = cam.toGrey();
      result = manatee.scanQR(image, width, height);
      callback();
    });
  }

  cam.start();
  async.whilst(noResult, capture, function(err) {
    cam.stop();
    callback(err, result);
  });
}

function scanPDF417(callback) {
  var result = null;
  var t0 = Date.now();

  function noResult() {
    var timeout = Date.now() - t0 > configuration.timeout;
    return !result && !timeout;
  }

  function capture(_callback) {
    cam.capture(function (err) {
      if (err) return _callback(err);
      var image = cam.toGrey();
      result = manatee.scanPDF417(image, width, height);
      callback();
    });
  }

  cam.start();
  async.whilst(noResult, capture, function(err) {
    cam.stop();
    callback(err, result);
  });
}

function scanPhotoID(callback) {
  var result = null;
  var t0 = Date.now();

  function noResult() {
    var timeout = Date.now() - t0 > configuration.timeout;
    return !result && !timeout;
  }

  function capture(_callback) {
    cam.capture(function (err) {
      if (err) return _callback(err);
      var image = cam.toGrey();
      var detected = supyo.detect(image, width, height);
      if (detected) {
        var rgb = cam.toRGB();
        result = new Png(rgb, width, height);
      }
      callback();
    });
  }

  cam.start();
  async.whilst(noResult, capture, function(err) {
    cam.stop();
    callback(err, result);
  });
}
