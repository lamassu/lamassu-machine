'use strict';

var secured = false;
var sessionId = null;

exports.reset = function reset(_sessionId) {
  sessionId = _sessionId;
  secured = false;
};

exports.isSecured = function isSecured() { return secured; };

exports.registerPhone = function registerPhone(number, cb) {
  if (number.slice(-1) === '0') return cb(new Error('network error'));
  if (number.slice(-1) === '1') return cb(null, {success: false});
  cb(null, {success: true});
};

exports.verifyCode = function verifyCode(code, cb) {
  if (code.slice(-1) === '0') return cb(new Error('network error'));
  if (code.slice(-1) === '1') return cb(null, {success: false});
  secured = true;
  cb(null, {success: true});
};
