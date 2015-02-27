'use strict';

var sessionId = null;

exports.reset = function reset(_sessionId) {
  sessionId = _sessionId;
};

exports.registerPhone = function registerPhone(number, cb) {
  setTimeout(function() {
    if (number.slice(-1) === '0') return cb(new Error('network error'));
    if (number.slice(-1) === '1') return cb(null, {success: false});
    if (number.slice(-1) === '2') return cb(null, {
      success: true,
      code: '123456',
      status: 'unknown'
    });
    if (number.slice(-1) === '3') return cb(null, {
      success: true,
      code: '123456',
      status: 'unconfirmed'
    });
    cb(null, {
      success: true,
      code: '123456',
      status: 'confirmed',
      tx: {fiat: 20, satoshis: 1e5 * 40, toAddress: '1xxx', currencyCode: 'EUR'}
    });
  }, 500);
};
