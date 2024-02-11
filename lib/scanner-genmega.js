const _ = require('lodash/fp')

const Pdf417Parser = require('./compliance/parsepdf417')
const { utils: coinUtils } = require('@lamassu/coins')
const scanner = require('./scanner')
const genmega = require('genmega')
const returnValuesTable = require('./genmega/common/return-table')

let barcodeScannerPath = null
let gmrunning = false

scanner.setDefaultFPS(5)

function config (_configuration) {
  scanner.config(_configuration)
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
    .then(data => {
      gmrunning = false
      if (_.isEmpty(data)) return callback(null, null)
      var parsed = Pdf417Parser.parse(data)
      if (!parsed) {
        return callback(null, null)
      }
      parsed.raw = data
      callback(null, parsed)
    })
    .catch(code => {
      gmrunning = false
      callback(new Error(returnValuesTable[code.toString()]))
    })
}

function scanPairingCode (callback) {
  gmrunning = true
  return genmega.BCSScan(barcodeScannerPath, 1)
    .then(data => {
      gmrunning = false
      if (_.isEmpty(data)) return callback(null, null)
      return callback(null, data)
    })
    .catch(code => {
      gmrunning = false
      callback(new Error(returnValuesTable[code.toString()]))
    })
}

function scanMainQR (cryptoCode, callback) {
  gmrunning = true
  return genmega.BCSScan(barcodeScannerPath, 1)
    .then(data => {
      gmrunning = false
      if (_.isEmpty(data)) {
        console.log('scanner: Empty response from genmega lib', data)
        return callback(null, null)
      }
      console.log('DEBUG55: %s', data)
      const network = 'main'
      callback(null, coinUtils.parseUrl(cryptoCode, network, data))
    })
    .catch(code => {
      gmrunning = false
      callback(new Error(returnValuesTable[code.toString()]))
    })
}

function scanPK (callback) {
  gmrunning = true
  return genmega.BCSScan(barcodeScannerPath, 0)
    .then(data => {
      gmrunning = false
      if (_.isEmpty(data)) return callback(null, null)
      callback(null, data)
    })
    .catch(code => {
      gmrunning = false
      callback(new Error(returnValuesTable[code.toString()]))
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
  hasCamera: scanner.hasCamera,
  takeFacePhotoTC: scanner.takeFacePhotoTC
}
