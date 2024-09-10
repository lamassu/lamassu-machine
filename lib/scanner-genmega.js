const _ = require('lodash/fp')

const Pdf417Parser = require('./compliance/parsepdf417')
const { utils: coinUtils } = require('@lamassu/coins')
const scanner = require('./scanner')
const genmega = require('genmega')
const returnValuesTable = require('./genmega/common/return-table')

let barcodeScannerPath = null
let gmrunning = false

function config (_configuration) {
  scanner.config(_configuration)
  scanner.setFPS(5)
  barcodeScannerPath = _.get(`scanner.device`, _configuration)
}

function cancel () {
  if (gmrunning) {
    genmega.BCSCancelScan()
  } else {
    scanner.cancel()
  }
}

const isOpened = () => gmrunning || scanner.isOpened()

function scanPDF417 (callback) {
  gmrunning = true
  return genmega.BCSScan(barcodeScannerPath, 1)
    .then((code, data) => {
      gmrunning = false
      if (code < 0) return callback(new Error(returnValuesTable[code]))
      if (!data) return callback(null, null)
      callback(null, Pdf417Parser.parse(data))
    })
}

function scanPairingCode (shouldSaveAttempt, callback) {
  gmrunning = true
  return genmega.BCSScan(barcodeScannerPath, 1)
    .then((code, data) => {
      gmrunning = false
      if (code < 0) return callback(new Error(returnValuesTable[code]))
      if (!data) data = null
      return callback(null, data)
    })
}

function scanMainQR (cryptoCode, shouldSaveAttempt, callback) {
  gmrunning = true
  return genmega.BCSScan(barcodeScannerPath, 1)
    .then(({ iRet, code}) => {
      gmrunning = false
      if (iRet < 0) return callback(new Error(returnValuesTable[iRet]))

      if (!code) {
        console.log('scanner: Empty response from genmega lib', code)
        return callback(null, null)
      }
      console.log('DEBUG55: %s', code)
      const network = 'main'
      callback(null, coinUtils.parseUrl(cryptoCode, network, code))
    })
}

function scanPK (callback) {
  gmrunning = true
  return genmega.BCSScan(barcodeScannerPath, 0)
    .then((code, data) => {
      gmrunning = false
      if (code < 0) return callback(new Error(returnValuesTable[code]))
      if (!data) data = null
      callback(null, data)
    })
}

function scanPhotoCard (callback) {
  return callback(new Error('ID Card photo is not supported for genmega!'))
}

module.exports = {
  config,
  scanPairingCode,
  scanMainQR,
  scanPDF417,
  scanPhotoCard,
  takeFacephoto: scanner.takeFacephoto,
  cancel,
  isOpened,
  scanPK,
  getDelayMS: scanner.getDelayMS,
  hasCamera: scanner.hasCamera,
  takeFacePhotoTC: scanner.takeFacePhotoTC,
  delayedFacephoto: scanner.delayedFacephoto,
  delayedPhoto: scanner.delayedPhoto,
  diagnosticPhotos: scanner.diagnosticPhotos
}
