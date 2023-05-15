const _ = require('lodash/fp')
const Pdf417Parser = require('./compliance/parsepdf417')
const { utils: coinUtils } = require('@lamassu/coins')
const jpg = require('jpeg-turbo')
const supyo = require('@lamassu/supyo')
const cameraStreamer = require('./camera-streamer')
const network = require('minimist')(process.argv.slice(2)).network || 'main'
const genmega = require('genmega')
const returnValuesTable = require('./genmega/common/return-table')

const selectedCamResolutions = {}

let configuration = null
let cancelFlag = false
let opened = false
let barcodeScannerPath = null

module.exports = {
  config,
  scanPairingCode,
  scanMainQR,
  scanPDF417,
  scanPhotoCard,
  takeFacephoto,
  cancel,
  isOpened,
  scanPK,
  hasCamera,
  takeFacePhotoTC
}

const maxCamResolutions = [
  {
    width: 2592,
    height: 1944
  }
]

const minCamResolutions = [
  {
    width: 1280,
    height: 1024
  },
  {
    width: 1280,
    height: 960
  },
  {
    width: 1280,
    height: 720
  },
  {
    width: 640,
    height: 480
  }
]

const maxCamResolutionQRCode = [
  {
    width: 640,
    height: 480
  }
]

const maxCamResolutionPhotoId = [
  {
    width: 1280,
    height: 1024
  }
]

const mode2conf = mode =>
  mode === 'facephoto' ? 'frontFacingCamera' : 'scanner'
const getCameraDevice = mode =>
  _.get([mode2conf(mode), 'device'], configuration)
const getCameraConfig = mode =>
  _.get([mode2conf(mode), mode], configuration)

function setConfig (formats, mode) {
  const isQRCodeMode = mode === 'qr'
  const isPhotoIdMode = mode === 'photoId'

  let format = selectedCamResolutions[mode]
  if (!_.isNil(format)) return format

  const pixelRes = format => format.width * format.height
  const isSuitableRes = res => {
    const currentRes = pixelRes(res)

    const isAboveMinAcceptableResolutions = _.some(_.flow(pixelRes, _.gte(currentRes)))
    const isUnderMaxAcceptableResolutions = _.some(_.flow(pixelRes, _.lte(currentRes)))

    const maxResolutions = isQRCodeMode ? maxCamResolutionQRCode :
      isPhotoIdMode ? maxCamResolutionPhotoId :
      maxCamResolutions
    return isUnderMaxAcceptableResolutions(maxResolutions) &&
     isAboveMinAcceptableResolutions(minCamResolutions)
  }

  selectedCamResolutions[mode] = format = _.flow(
    _.filter(f => f.format === 'Motion-JPEG'),
    _.orderBy(pixelRes, ['desc']),
    _.find(isSuitableRes),
  )(formats)

  console.log("Picked camera format: ", format)

  if (!format) throw new Error('Unsupported cam resolution!')
  return format
}

const pickFormat = mode => formats => setConfig(formats, mode)

function config (_configuration) {
  configuration = _configuration
  barcodeScannerPath = _.get(`scanner.device`, configuration)
}

function cancel () {
  // TODO: Use AbortSignal with the camera streamer to cancel a scan
  cancelFlag = true
  genmega.BCSCancelScan()
}

function isOpened () {
  return opened
}

function hasCamera (mode) {
  const device = getCameraDevice(mode)
  // TODO: how to get the Promise's result?
  if (device && cameraStreamer.hasCamera(device)) {
    console.log('Camera device available: ' + device)
    return true
  }
  return false
}
// resultCallback returns final scan result
// captureCallback returns result of a frame capture
function scan (mode, resultCallback, captureCallback) {
  cancelFlag = false
  if (opened) {
    console.log("Camera is already open. Shouldn't happen.")
    return resultCallback(new Error('Camera open'))
  }

  let handle = null
  const device = getCameraDevice(mode)
  const modeConfig = getCameraConfig(mode)

  const shutdown = () => {
    clearInterval(handle)
    opened = false
    cancelFlag = false
  }

  const capture = () => {
    console.log("capture called, cancelFlag:", cancelFlag)
    if (!opened || cancelFlag) return shutdown()
   cameraStreamer.captureFrame(device, pickFormat(mode))
    .then(frame => frame.length === 0 ? Promise.reject('emptybuf') : frame)
    .then(frame => ({
      frame,
      greyscale: jpg.decompressSync(frame, { format: jpg.FORMAT_GRAY })
    }))
    .then(({ frame, greyscale }) => {
      if (!opened || cancelFlag) return shutdown()
      const { width, height } = selectedCamResolutions[mode]
      return captureCallback(modeConfig, width, height, frame, greyscale.data, function (err, result) {
        if (!opened || cancelFlag) return shutdown()
        if (!err && result) {
          shutdown()
          return resultCallback(err, result)
        }
      })
    })
    // This is an error thrown by the camera streamer, e.g. a problem executing
    // the program or something
    // TODO: Anything better we can do with the error?
    .catch(err => {
      if (err != 'emptybuf') {
        console.error(err)
        shutdown()
      }
    })
  }

  opened = true
  handle = setInterval(capture, 1000)
}

function scanPDF417 (callback) {
  return genmega.BCSScan(barcodeScannerPath, 1)
    .then(data => {
      if (_.isEmpty(data)) return callback(null, null)
      var parsed = Pdf417Parser.parse(data)
      if (!parsed) {
        return callback(null, null)
      }
      parsed.raw = data
      callback(null, parsed)
    })
    .catch(code => {
      callback(new Error(returnValuesTable[code.toString()]))
    })
}

function scanFacephoto (callback) {
  scan('facephoto', callback, function (modeConfig, width, height, frame, greyscale, _callback) {
    const detected = supyo.detect(greyscale, width, height, {
      minSize: modeConfig.minFaceSize || 100,
      qualityThreshold: modeConfig.threshold || 20,
      verbose: false
    })
    console.log("supyo result: ", detected)
    if (!detected) return _callback(null, null)
    _callback(null, frame)
  })
}

function scanFacephotoTC (callback) {
  scan('facephoto', callback, function (modeConfig, width, height, frame, greyscale, _callback) {
    _callback(null, frame)
  })
}

function scanPairingCode (callback) {
  return genmega.BCSScan(barcodeScannerPath, 1)
    .then(data => {
      if (_.isEmpty(data)) return callback(null, null)
      return callback(null, data)
    })
    .catch(code => {
      callback(new Error(returnValuesTable[code.toString()]))
    })
}

function scanMainQR (cryptoCode, callback) {
  return genmega.BCSScan(barcodeScannerPath, 1)
    .then(data => {
      if (_.isEmpty(data)) return callback(null, null)
      console.log('DEBUG55: %s', data)
      callback(null, coinUtils.parseUrl(cryptoCode, network, data))
    })
    .catch(code => {
      callback(new Error(returnValuesTable[code.toString()]))
    })
}

function scanPK (callback) {
  return genmega.BCSScan(barcodeScannerPath, 0)
    .then(data => {
      if (_.isEmpty(data)) return callback(null, null)
      callback(null, data)
    })
    .catch(code => {
      callback(new Error(returnValuesTable[code.toString()]))
    })
}

function scanPhotoCard (callback) {
  return callback(new Error('ID Card photo is not supported for genmega!'))
}

function takeFacephoto (callback) {
  console.log("takeFacephoto called")
  scanFacephoto(function (err, result) {
    if (err) return callback(err)
    if (!result) return callback(null, null)

    callback(null, result)
  })
}

function takeFacePhotoTC (callback) {
  scanFacephotoTC(function (err, result) {
    if (err) return callback(err)
    if (!result) return callback(null, null)

    callback(null, result)
  })
}
