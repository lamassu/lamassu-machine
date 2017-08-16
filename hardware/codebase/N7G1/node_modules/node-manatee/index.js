'use strict';

var manatee = require('./build/Release/manatee');

var CODENAMES = {
  qr: 0x00000001,
  pdf417: 0x00000040
};

exports.scanningLevel = 3;

exports.version = manatee.version;

exports.register = function register(codeName, username, key) {
  var codeMask = CODENAMES[codeName];
  if (!codeMask) throw new Error('Unrecognized codeName: ' + codeName);

  var result = manatee.register(codeMask, username, key);
  if (result === 0) return;

  switch (result) {
    case -3: throw new Error('Decoder type or registration not supported');
    default: throw new Error('Registration failed');
  }
};

exports.scan = function scan(image, width, height, codeName) {
  var codeMask = CODENAMES[codeName];
  if (!codeMask) throw new Error('Unrecognized codeName: ' + codeName);

  return manatee.scan(image, width, height, codeMask, exports.scanningLevel);
};

exports.scanQR = function scanQR(image, width, height) {
  return exports.scan(image, width, height, 'qr');
};

exports.scanPDF417 = function scanPDF417(image, width, height) {
  return exports.scan(image, width, height, 'pdf417');
};
