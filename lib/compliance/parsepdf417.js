'use strict';

var crypto = require('crypto');

module.exports.parse = function parse(data) {
  try {
    return parseRaw(data.toString());
  } catch (ex) {
    return null;
  }
};

// This generates a unique, reproducible ID based on the info in the barcode
function generateUID(subfile) {
  return crypto.createHash('sha256').update(subfile).digest('hex');
}

function parseRaw(data) {
  var offset = data.indexOf('@');
  if (offset === -1) return null;

  var payload = data.substr(offset);
  var version = parseDecimal(payload.substr(15, 2));
  var idSubfile = fetchIdSubfile(payload);
  var uid = generateUID(idSubfile);

  var lines = idSubfile.split('\n');
  var result = {uid: uid};
  lines.forEach(function (line) {
    addField(result, line);
  });

  return normalize(result, version);
}

function fetchIdSubfile(payload) {
  var subFileCount = parseDecimal(payload.substr(19, 2));
  var SUBFILE_OFFSET = 21;
  for (var i = 0; i < subFileCount; i++) {
    var subFilePayload = payload.substr(SUBFILE_OFFSET + i * 10, 10);
    var subFileCode = subFilePayload.substr(0, 2);
    if (subFileCode !== 'DL' && subFileCode !== 'ID') continue;
    var offset = parseDecimal(subFilePayload.substr(2, 4));
    var length = parseDecimal(subFilePayload.substr(6, 4));

    // Strip first two characters, which indicate subfile type
    return payload.substr(offset + 2, length - 2);
  }

  return null;
}

function addField(result, line) {
  var code = line.substr(0, 3);
  var value = line.substr(3).trim();
  switch (code) {
    case 'DCS':
      result.lastName = value;
      break;
    case 'DAC':
    case 'DCT':
      result.firstName = value;
      break;
    case 'DBB':
      result.dateOfBirth = value;
      break;
    case 'DAG':
      result.address = value;
      break;
    case 'DAI':
      result.city = value;
      break;
    case 'DAJ':
      result.state = value;
      break;
    case 'DAK':
      result.postalCode = value;
      break;
    case 'DCG':
      result.country = value;
      break;
  }
}

function parseDecimal(str) {
  var integer = parseInt(str, 10);
  if (isNaN(integer)) throw new Error('Input is not a number');
  return integer;
}

function normalize(result, version) {
  var date = result.dateOfBirth;
  var country = result.country;
  if (country === 'USA' && version > 1) result.dateOfBirth = date.substr(4, 4) + date.substr(0, 4);
  result.postalCode = result.postalCode.substr(0, 5);

  return result;
}
