// Used to test light pulses and camera capture

'use strict';

var fs = require('fs');
var seret = require('seret');
var async = require('async');
var SerialPort = require('serialport').SerialPort;
var util = require('util');

var trigger = false;
var count = 0;

var cam = null;
var serial = null;

function log(obj) {
  console.log(util.inspect(obj, {depth: null, colors: true}));
}

function camOn() {
  cam = new seret.Camera('/dev/video0');
  var width = 1280;
  var height = 760;
  cam.configSet({width: width, height: height});
  cam.controlSet(0x9a0902, 250);
  log(cam.controlGet(0x9a0902));
  cam.start();
}

function forever() { return true; }

function startScanning() {

  function capture(callback) {
    cam.capture(function (success) {
      if (!success) return callback();

      if (trigger) {
        trigger = false;
        var image = cam.toGrey();
        fs.writeFileSync('result-' + count + '.gray', image);
        console.log('snapped');
      }
      callback();
    });
  }

  async.whilst(forever, capture, function() {
  });
}

function lightOpen(callback) {
  serial = new SerialPort('/dev/ttyS0', false);

  serial.on('error', function(err) { console.log(err); });
  serial.on('open', function (err) {
    if (err) throw err;
    callback();
  });

  serial.open();
}

function lightOn(callback) {
  serial.setStatus(0x4006, function(err) {
    if (err) throw err;
    console.log('light on');
    if (callback) callback();
  });
}

function lightOff(callback) {
  serial.setStatus(0x4002, function(err) {
    if (err) throw err;
    if (callback) callback();
  });
}

var on = parseInt(process.argv[2]);
var off = parseInt(process.argv[3]);

//if (!delay) throw "Need delay";

camOn();
startScanning();

lightOpen(function () {
  lightOff();
  setTimeout(function() {
    lightOn();
    // setTimeout(function() { trigger = true; }, delay);
  }, 1000);
  setTimeout(function() {
    lightOff();
  }, 1000 + on);
  setTimeout(function() {
    lightOn();
  }, 1000 + on + off);
  setTimeout(function() {
    lightOff();
  }, 1000 + off + 2*on);
});
