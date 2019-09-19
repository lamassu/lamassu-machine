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
  cancel,
  isOpened,
  scanPK
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
    if (!mockData.qrDataSource) {
      var resultStr = mockData.qrData[cryptoCode]
    } else {
      resultStr = fs.readFileSync(path.join(__dirname, '../../', mockData.qrDataSource))
    }
    const network = 'main'
    try {
      callback(null, coinUtils.parseUrl(cryptoCode, network, resultStr))
    } catch (error) {
      callback(error)
    }
  }, cbTimeout)
}

function scanPK (callback) {
  _cancelCb = callback
  handle = setTimeout(function () {
    var resultStr = mockData.pk
    if (mockData.pk) {
      return callback(null, resultStr)
    }

    callback(new Error('No mock PK defined'))
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
  _cancelCb = callback

  const photoData = mockData.fakeLicense
  handle = setTimeout(function () {
    callback(null, photoData)
  }, cbTimeout)
}

function scanFacephoto (callback) {
  _cancelCb = callback

  const photoData = mockData.fakeLicense
  handle = setTimeout(function () {
    callback(null, photoData)
  }, cbTimeout)
}

function isOpened () {
  return true
}

function cancel () {
  clearTimeout(handle)
  camera && camera.closeCamera()
  if (_cancelCb) _cancelCb()
  _cancelCb = null
}
