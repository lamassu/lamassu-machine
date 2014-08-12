'use strict';

var cp = require('child_process');
var path = require('path');
var fs = require('fs');
var Parser = require('./parsepdf417');

var SCANNER_PATH = path.join(__dirname, 'scanpdf417');

var ScanId = function(config) {
  this.config = config;
  this.timeout = config.timeout;
  this.idScanner = null;
};

module.exports = ScanId;

ScanId.factory = function factory(config) {
  return new ScanId(config);
};

ScanId.prototype.scan = function scan(cb) {
  var self = this;
  fs.unlink('/tmp/scan.jpg', function () {
    self._scan(cb);
  });
};

ScanId.prototype.cancel = function cancel() {
  if (this._cancel) this._cancel();
};

ScanId.prototype._scan = function _scan(cb) {
  var idScanner = cp.spawn(SCANNER_PATH);
  var frame = '';
  var timeout = this.timeout;
  var to = setTimeout(cancel, timeout);
  var self = this;

  function cancel() {
    cb(null, null);
    idScanner.kill();
    reset();
  }

  this._cancel = cancel;

  idScanner.stdout.setEncoding('utf8');
  idScanner.stdout.on('data', function (data) {
    frame += data;
    var result = parseFrame(frame);
    if (result) {
      frame = '';
      reset();
      idScanner.kill();
      var parsed = Parser.parse(result);
      cb(null, parsed);
    }
  });

  idScanner.on('error', function (err) {
    cb(err);
    reset();
  });

  idScanner.on('exit', function (code) {
    if (!code) return;
    cb(new Error('scanner exited with code: ' + code));
    reset();
  });

  function reset() {
    self._cancel = null;
    clearTimeout(to);
  }
};

function parseFrame(frame) {
  var fixedFrame = stripEscapeSequence(frame);
  var lengthMatch = fixedFrame.match(/Result length: (\d+)/);
  if (lengthMatch === null) return null;
  var length = parseInt(lengthMatch[1]);
  var sub = fixedFrame.substr(lengthMatch.index);
  var dataMatch = sub.match(/ Decoded string: /);
  if (dataMatch === null) return null;
  var startIndex = dataMatch.index + 17;
  if (sub.length < startIndex + length) return null;
  var content = sub.substr(startIndex, length);
  return content;
}

function stripEscapeSequence(str) {
  var ESCAPE_SEQUENCE = /\x1b\[0m/g;
  return str.replace(ESCAPE_SEQUENCE, '');
}
