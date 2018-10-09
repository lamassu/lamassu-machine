const _ = require('lodash/fp')
var Parser = require('../../lib/compliance/parsepdf417')
var coinUtils = require('../coins/utils')

module.exports = {
  config: config,
  scanPairingCode: scanPairingCode,
  scanMainQR: scanMainQR,
  scanPDF417: scanPDF417,
  scanPhotoCard: scanPhotoCard,
  cancel: cancel
}

var configuration = null
var data = null
var _cancelCb = null
let handle
let camera = null

function config (_configuration) {
  configuration = _configuration
  data = _.get('scanner.mock.data', _configuration)
  camera = require('../camera').config(_configuration)
}

function scanPairingCode (callback) {
  _cancelCb = callback
  handle = setTimeout(function () { callback(null, data.pairingData) }, 5000)
}

function scanMainQR (cryptoCode, callback) {
  _cancelCb = callback
  handle = setTimeout(function () {
    var resultStr = data.qrData[cryptoCode]
    const network = 'main'
    return callback(null, coinUtils.parseUrl(cryptoCode, network, resultStr))
  }, 2000)
}

function scanPDF417 (callback) {
  _cancelCb = callback

  const pdf417Data = configuration.mock.data.pdf417Data
  handle = setTimeout(function () { callback(null, Parser.parse(pdf417Data)) }, 2000)
}

function scanPhotoCard (callback) {
  if (!camera) {
    return callback(new Error('First initialize the camera-wrapper'))
  }

  camera.openCamera({
    verbose: true,
    faceDetect: true,
    width: 640,
    height: 480,
    codec: '.jpg',
    onError: callback,
    onFaceDetected: frameRaw => {
      setTimeout(function () {
        callback(null, frameRaw)
      }, 500)

      // if onFaceDetected callback returned false
      // it means that we can close the camera
      return false
    }
  })

  if (!camera.isOpened()) {
    callback(new Error('Unable to open camera-wrapper'))
  }
}

function cancel () {
  clearTimeout(handle)
  camera && camera.closeCamera()
  if (_cancelCb) _cancelCb()
}
