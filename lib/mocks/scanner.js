const _ = require('lodash/fp')
const Pdf417Parser = require('../compliance/parsepdf417')
const coinUtils = require('../coins/utils')

module.exports = {
  config,
  scanPairingCode,
  scanMainQR,
  scanPDF417,
  scanPhotoCard,
  cancel
}

const cbTimeout = 5000
let configuration = null
let _cancelCb = null
let mockData = null
let handle
let camera = null

function config (_configuration) {
  configuration = _configuration

  mockData = _.get('scanner.mock.data', configuration)

  const mode = _.defaultTo(
    _.get('scanner.photoId', configuration),
    _.get('scanner.photoCard', configuration))

  const opts = _.extendAll({}, mode, {
    device: _.get('scanner.device', configuration),

    debug: true,
    verbose: false,

    mock: _.defaultTo(false, _.get('mockCam', configuration)),
    mockImage: _.defaultTo(false, _.get('brain.mockCameraImage', configuration))
  })

  camera = require('../camera')
  camera.config(opts)
}

function scanPairingCode (callback) {
  _cancelCb = callback
  handle = setTimeout(function () {
    callback(null, mockData.pairingData)
  }, cbTimeout)
}

function scanMainQR (cryptoCode, callback) {
  _cancelCb = callback
  handle = setTimeout(function () {
    var resultStr = mockData.qrData[cryptoCode]
    const network = 'main'
    return callback(null, coinUtils.parseUrl(cryptoCode, network, resultStr))
  }, cbTimeout)
}

function scanPDF417 (callback) {
  _cancelCb = callback

  const pdf417Data = mockData.pdf417Data
  handle = setTimeout(function () {
    callback(null, Pdf417Parser.parse(pdf417Data))
  }, cbTimeout)
}

function scanPhotoCard (callback) {
  if (!camera) {
    return callback(new Error('First initialize the camera-wrapper'))
  }

  const opts = _.extend({
    faceDetect: true,
    onError: callback,
    onFaceDetected: frameRaw => {
      callback(null, frameRaw)

      // if onFaceDetected callback returned false
      // it means that we can close the camera
      return false
    }
  }, config)

  if (!camera.openCamera(opts)) {
    callback(new Error('Unable to open camera-wrapper'))
  }
}

function cancel () {
  clearTimeout(handle)
  camera && camera.closeCamera()
  if (_cancelCb) _cancelCb()
  _cancelCb = null
}
