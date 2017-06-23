var Parser = require('../../lib/compliance/parsepdf417')

var coinUtils = require('../coins/utils')

module.exports = {
  config: config,
  scanPairingCode: scanPairingCode,
  scanMainQR: scanMainQR,
  scanPDF417: scanPDF417,
  cancel: cancel
}

var configuration = null
var data = null
var _cancelCb = null
let handle

function config (_configuration) {
  configuration = _configuration
  data = _configuration.mock.data
}

function scanPairingCode (callback) {
  _cancelCb = callback
  handle = setTimeout(function () { callback(null, data.pairingData) }, 5000)
}

function scanMainQR (cryptoCode, callback) {
  _cancelCb = callback
  handle = setTimeout(function () {
    var resultStr = data.qrData[cryptoCode]
    console.log('DEBUG405: %j', [cryptoCode, data.qrData])
    const network = 'main'
    return callback(null, coinUtils.parseUrl(cryptoCode, network, resultStr))
  }, 2000)
}

function scanPDF417 (callback) {
  _cancelCb = callback
  var pdf417Data = configuration.pdf417Data
  handle = setTimeout(function () { callback(null, Parser.parse(pdf417Data)) }, 2000)
}

function cancel () {
  clearTimeout(handle)
  if (_cancelCb) _cancelCb()
}
