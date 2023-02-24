const _ = require('lodash/fp')
const Pdf417Parser = require('./compliance/parsepdf417')
const { utils: coinUtils } = require('@lamassu/coins')
const v4l2camera = require('@joepie91/v4l2camera')
const jpg = require('jpeg-turbo')
const manatee = { register: _.noop, scanPDF417: _.noop, scanQR: _.noop }
const supyo = require('@lamassu/supyo')
const network = require('minimist')(process.argv.slice(2)).network || 'main'
const genmega = require('genmega')

const selectedCamResolutions = {}

let configuration = null
let cancelFlag = false
let opened = false
let processing = false
let closing = false
let openedFromOutside = false
let openSettings = null
let barcodeScannerPath = null

module.exports = {
  config,
  prepareForCapture,
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

function setConfig (cam, mode) {
  const isQRCodeMode = mode === 'qr'
  const isPhotoIdMode = mode === 'photoId'

  var format = null
  const cachedRes = selectedCamResolutions[mode]
  if (!_.isNil(cachedRes)) return cachedRes

  const pixelRes = format => format.width * format.height
  const sortByPixelRes = _.orderBy(pixelRes, ['desc'])

  const isSuitableRes = res => {
    const currentRes = pixelRes(res)

    const gteCurrent = _.gte(currentRes)
    const lteCurrent = _.lte(currentRes)

    const isAboveMinAcceptableResolutions = _.compose(_.some(_.identity), _.map(gteCurrent), _.map(pixelRes))
    const isUnderMaxAcceptableResolutions = _.compose(_.some(_.identity), _.map(lteCurrent), _.map(pixelRes))

    return isUnderMaxAcceptableResolutions(isQRCodeMode ? maxCamResolutionQRCode : isPhotoIdMode ? maxCamResolutionPhotoId : maxCamResolutions) &&
     isAboveMinAcceptableResolutions(minCamResolutions)
  }

  const availableFormats = sortByPixelRes(cam.formats.filter(f => f.formatName === 'MJPG'))

  format = _.find(isSuitableRes, availableFormats)

  if (!format) throw new Error('Unsupported cam resolution!')

  selectedCamResolutions[mode] = format

  return format
}

function config (_configuration) {
  configuration = _configuration
  barcodeScannerPath = _.get(`scanner.device`, configuration)

  const licenses = _.get('scanner.manatee.license', configuration)
  manatee.register('qr', _.get('qr.name', licenses), _.get('qr.key', licenses))
  manatee.register('pdf417', _.get('pdf417.name', licenses), _.get('pdf417.key', licenses))
}

function cancel () {
  cancelFlag = true
  genmega.BarcodeScanCancel()
}

function isOpened () {
  return opened
}

function hasCamera (mode) {
  const cameraConf = mode === 'facephoto' ? 'frontFacingCamera' : 'scanner'

  const device = _.get(`${cameraConf}.device`, configuration)

  if (!device) return false

  console.log('Camera device available: ' + device)
  try {
    new v4l2camera.Camera(device)
    return true
  } catch (err) {
    return false
  }
}
// resultCallback returns final scan result
// captureCallback returns result of a frame capture
function scan (mode, resultCallback, captureCallback) {
  if (!openedFromOutside && opened) {
    console.log("Camera is already open. Shouldn't happen.")
    return resultCallback(new Error('Camera open'))
  }

  const {
    cam,
    modeConfig,
    width,
    height
  } = _prepareForCapture(mode)

  var handle = setInterval(capture, 100)

  function capture () {
    if (cancelFlag) {
      if (opened && !closing && !processing) {
        closing = true
        clearInterval(handle)
        cam.stop(() => {
          processing = false
          opened = false
          closing = false
          openedFromOutside = false
          openSettings = null
          return resultCallback()
        })
      }

      return
    }

    if (processing) return
    processing = true

    cam.capture(function (success) {
      if (!success) {
        processing = false
        return
      }

      var frame = Buffer.from(cam.frameRaw())
      let greyscale = null

      try {
        greyscale = jpg.decompressSync(frame, { format: jpg.FORMAT_GRAY })
      } catch (err) {
        processing = false
        return
      }

      captureCallback(modeConfig, width, height, frame, greyscale.data, function (err, result) {
        if (!err && !result && !cancelFlag) {
          processing = false
          openedFromOutside = false
          openSettings = null
          return
        }

        clearInterval(handle)
        cam.stop(() => {
          processing = false
          opened = false
          openedFromOutside = false
          openSettings = null
          return resultCallback(err, result)
        })
      })
    })
  }
}

function scanPDF417 (callback) {
  const result = genmega.BarcodeScan(barcodeScannerPath)
  if (!result) return callback(null, null)
  if (Number(result) < 0) {
    callback(new Error('Scan failed!'))
  }
  var parsed = Pdf417Parser.parse(result)
  if (!parsed) {
    return callback(null, null)
  }
  parsed.raw = result.toString()
  callback(null, parsed)
}

function scanFacephoto (callback) {
  scan('facephoto', callback, function (modeConfig, width, height, frame, greyscale, _callback) {
    const detected = supyo.detect(greyscale, width, height, {
      minSize: modeConfig.minFaceSize || 100,
      qualityThreshold: modeConfig.threshold || 20,
      verbose: false
    })

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
  const result = genmega.BarcodeScan(barcodeScannerPath)
  if (!result) return callback()
  if (Number(result) < 0) {
    callback(new Error('Scan failed!'))
  }
  if()
  return callback(null, result)
}

function scanMainQR (cryptoCode, callback) {
  const result = genmega.BarcodeScan(barcodeScannerPath)
  if (!result) return callback(null, null)
  if (Number(result) < 0) {
    callback(new Error('Scan failed!'))
  }
  console.log('DEBUG55: %s', result)
  try {
    callback(null, coinUtils.parseUrl(cryptoCode, network, result))
  } catch (error) {
    callback(error)
  }
}

function scanPK (callback) {
  const result = genmega.BarcodeScan(barcodeScannerPath)
  if (!result) return callback(null, null)
  if (Number(result) < 0) {
    callback(new Error('Scan failed!'))
  }
  return callback(null, result)
}

function scanPhotoCard (callback) {
  return callback(new Error('ID Card photo is not supported for genmega!'))
}

function takeFacephoto (callback) {
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

function _prepareForCapture (mode) {
  if (opened) return openSettings
  // Pick correct camera
  const cameraConf = mode === 'facephoto' ? 'frontFacingCamera' : 'scanner'

  const device = _.get([cameraConf, 'device'], configuration)
  const modeConfig = _.get([cameraConf, mode], configuration)

  const cam = new v4l2camera.Camera(device)

  cancelFlag = false

  const format = setConfig(cam, mode)

  cam.configSet(format)

  console.log('Opening v4l2camera device: ' + device + ' with mode: ' + mode, format)

  const width = format.width
  const height = format.height

  cam.start()

  opened = true
  openSettings = {
    cam,
    modeConfig,
    width,
    height
  }
  return openSettings
}

function prepareForCapture (mode) {
  openedFromOutside = true
  _prepareForCapture(mode)
}
