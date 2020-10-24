const _ = require('lodash/fp')
const Pdf417Parser = require('../compliance/parsepdf417')
const coinUtils = require('../coins/utils')
const fs = require('fs')
const path = require('path')

module.exports = {
  config,
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
  opened = true
  _cancelCb = callback
  handle = setTimeout(function () {
    opened = false
    _cancelCb = null
    callback(null, mockData.pairingData)
  }, cbTimeout)
}

function scanMainQR (cryptoCode, callback) {
  opened = true
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
  opened = true
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
  opened = true
  _cancelCb = callback

  const pdf417Data = mockData.pdf417Data
  handle = setTimeout(function () {
    _cancelCb = null
    opened = false
    callback(null, Pdf417Parser.parse(pdf417Data))
  }, cbTimeout)
}

function scanPhotoCard (callback) {
  opened = true
  _cancelCb = callback

  const photoData = mockData.fakeLicense
  handle = setTimeout(function () {
    _cancelCb = null
    opened = false
    callback(null, photoData)
  }, cbTimeout)
}

function scanFacephoto (callback) {
  opened = true
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
  opened = false
  clearTimeout(handle)
  camera && camera.closeCamera()
  if (_cancelCb) _cancelCb(null, null)
  _cancelCb = null
}
