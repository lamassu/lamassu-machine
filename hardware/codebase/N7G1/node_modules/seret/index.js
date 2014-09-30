'use strict';

var async = require('async');
var cam = require('./build/Release/seret');
var fd = null;
var buffer = null;
var width = null;
var height = null;

var FPS = 6;
var DELAY = 1000 / FPS;
var TIMEOUT = 5000;

exports.cameraOn = function cameraOn(device, newBuffer, newWidth, newHeight) {
  width = newWidth;
  height = newHeight;
  buffer = newBuffer;
  fd = cam.cameraOn(device, width, height, FPS);
};

exports.cameraOff = function cameraOff() {
  cam.cameraOff(fd);
  fd = null;
  width = null;
  height = null;
  buffer = null;
};

exports.startCapture = function startCapture() {
  cam.startCapture(fd);
};

exports.stopCapture = function stopCapture() {
  cam.stopCapture(fd);
};

exports.captureFrame = function captureFrame(callback) {
  var success = false;
  var t0 = Date.now();

  function test() {
    return success;
  }

  function capture(_callback) {
    var result = cam.captureFrame(fd, buffer);
    if (result < 0) return _callback(new Error('Capture failed'));
    success = (result === 1);
    if (success) return _callback();
    setTimeout(_callback, DELAY);
  }

  async.doUntil(capture, test, callback);
};

// Note: This must be called either between cameraOn and startCapture
// or immediately after captureFrame
exports.controlSet = function controlSet(id, value) {
  cam.controlSet(fd, id, value);
};
