const _ = require('lodash/fp')
const Pdf417Parser = require('../compliance/parsepdf417')
const coinUtils = require('../coins/utils')
const fs = require('fs')
const path = require('path')

module.exports = {
  config,
  prepareForCapture,
  scanPairingCode,
  scanMainQR,
  scanPDF417,
  scanPhotoCard,
  scanFacephoto,
  takeFacephoto,
  cancel,
  isOpened,
  scanPK,
  hasCamera
}

const cbTimeout = 5000
let configuration = null
let _cancelCb = null
let mockData = null
let handle
let camera = null
let opened = false

function config (_configuration) {
  configuration = _configuration

  mockData = _.get('scanner.mock.data', configuration)
}

function scanPairingCode (callback) {
  prepareForCapture()
  _cancelCb = callback
  handle = setTimeout(function () {
    opened = false
    _cancelCb = null
    callback(null, mockData.pairingData)
  }, cbTimeout)
}

function scanMainQR (cryptoCode, callback) {
  prepareForCapture()
  _cancelCb = callback
  handle = setTimeout(function () {
    opened = false
    _cancelCb = null
    if (!mockData.qrDataSource) {
      forward(null, mockData.qrData[cryptoCode])
    } else {
      fs.readFile(path.join(__dirname, '../../', mockData.qrDataSource), forward)
    }

    function forward (err, resultStr) {
      const network = 'main'
      try {
        callback(null, coinUtils.parseUrl(cryptoCode, network, resultStr))
      } catch (error) {
        callback(error)
      }
    }
  }, cbTimeout)
}

function scanPK (callback) {
  prepareForCapture()
  _cancelCb = callback
  handle = setTimeout(function () {
    _cancelCb = null
    opened = false
    var resultStr = mockData.pk
    if (mockData.pk) {
      return callback(null, resultStr)
    }

    callback(new Error('No mock PK defined'))
  }, cbTimeout)
}

function scanPDF417 (callback) {
  prepareForCapture()
  _cancelCb = callback

  const pdf417Data = mockData.pdf417Data
  handle = setTimeout(function () {
    _cancelCb = null
    opened = false
    var parsed = Pdf417Parser.parse(pdf417Data)
    parsed.raw = pdf417Data.toString()
    callback(null, parsed)
  }, cbTimeout)
}

function scanPhotoCard (callback) {
  prepareForCapture()
  _cancelCb = callback

  const photoData = mockData.fakeLicense
  handle = setTimeout(function () {
    _cancelCb = null
    opened = false
    callback(null, photoData)
  }, cbTimeout)
}

function scanFacephoto (callback) {
  prepareForCapture()
  _cancelCb = callback

  const photoData = mockData.fakeLicense
  handle = setTimeout(function () {
    _cancelCb = null
    opened = false
    callback(null, photoData)
  }, cbTimeout)
}

function takeFacephoto (callback) {
  return scanFacephoto(callback)
}

function isOpened () {
  return opened
}

function hasCamera () {
  return true
}

function cancel () {
  console.log("closing camera")
  opened = false
  clearTimeout(handle)
  camera && camera.closeCamera()
  if (_cancelCb) _cancelCb(null, null)
  _cancelCb = null
}

function prepareForCapture() {
  console.log("opening camera")
  opened = true
}
