var Parser = require('../../lib/compliance/parsepdf417')
var PairingData = require('../pairingdata')

module.exports = {
  config: config,
  scanPairingCode: scanPairingCode,
  scanMainQR: scanMainQR,
  scanPDF417: scanPDF417,
  scanPhotoID: scanPhotoID,
  cancel: cancel
}

var configuration = null
var _cancelCb = null

function config (_configuration) {
  configuration = _configuration.mock.data
}

function scanPairingCode (callback) {
  var pairingData = PairingData.process(configuration.pairingData)
  return setTimeout(function () { callback(null, pairingData) }, 500)
}

function parseBitcoinURI (uri) {
  var res = /^(bitcoin:\/{0,2})?(\w+)/.exec(uri)
  var address = res && res[2]
  if (!address) {
    return null
  } else return address
}

function scanMainQR (callback) {
  var qrData = parseBitcoinURI(configuration.qrData)
  var to = setTimeout(function () {
    callback(null, qrData)
  }, 300)
  _cancelCb = function cancel () {
    clearTimeout(to)
    setTimeout(callback, 3000)
  }
}

function scanPDF417 (callback) {
  var pdf417Data = configuration.pdf417Data
  setTimeout(function () { callback(null, Parser.parse(pdf417Data)) }, 800)
}

function scanPhotoID (callback) {
  var fakeLicense = configuration.fakeLicense
  setTimeout(function () { callback(null, fakeLicense) }, 800)
}

function cancel () {
  if (_cancelCb) _cancelCb()
}
