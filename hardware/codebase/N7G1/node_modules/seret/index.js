'use strict';

var async = require('async');
var cam = require('./build/Release/seret');
var fd = null;
var buffer = null;
var width = null;
var height = null;

var FPS = 10;
var DELAY = 1000 / FPS;

exports.cameraOn = function cameraOn(device, newBuffer, newWidth, newHeight) {
  width = newWidth;
  height = newHeight;
  buffer = newBuffer;
  fd = cam.cameraOn(device, width, height);
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

  function test() {
    return success;
  }

  function capture(_callback) {
    var result = cam.captureFrame(fd, buffer);
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
