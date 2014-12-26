'use strict';

var sessionId = null;

exports.reset = function reset(_sessionId) {
  sessionId = _sessionId;
};

exports.registerPhone = function registerPhone(number, cb) {
  setTimeout(function() {
    if (number.slice(-1) === '0') return cb(new Error('network error'));
    if (number.slice(-1) === '1') return cb(null, {success: false});
    cb(null, {success: true, code: '123456'});
  }, 500);
};
