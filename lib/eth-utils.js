/* Adapted from web3.js https://github.com/ethereum/web3.js */
var CryptoJS = require('crypto-js')
var _sha3 = require('crypto-js/sha3')

function sha3 (value, options) {
  if (options && options.encoding === 'hex') {
    if (value.length > 2 && value.substr(0, 2) === '0x') {
      value = value.substr(2)
    }
    value = CryptoJS.enc.Hex.parse(value)
  }

  return _sha3(value, {
    outputLength: 256
  }).toString()
}

exports.isChecksumAddress = function (address) {
  address = address.replace('0x', '')
  var addressHash = sha3(address.toLowerCase())

  for (var i = 0; i < 40; i++) {
    if ((parseInt(addressHash[i], 16) > 7 && address[i].toUpperCase() !== address[i]) ||
        (parseInt(addressHash[i], 16) <= 7 && address[i].toLowerCase() !== address[i])) {
      return false
    }
  }
  return true
}
