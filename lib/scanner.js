const _ = require('lodash/fp')
const Pdf417Parser = require('./compliance/parsepdf417')
const { utils: coinUtils } = require('@lamassu/coins')
const jpg = require('jpeg-turbo')
const manatee = require('manatee')
const supyo = require('@lamassu/supyo')
const jsQR = require('jsqr')
const cameraStreamer = require('./camera-streamer')

const selectedCamResolutions = {}

let configuration = null
let cancelFlag = false
let opened = false

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

  if (!format) throw new Error('Unsupported cam resolution!')
  return format
}

const pickFormat = mode => formats => setConfig(formats, mode)

function config (_configuration) {
  configuration = _configuration

  const licenses = _.get('scanner.manatee.license', configuration)
  manatee.register('qr', _.get('qr.name', licenses), _.get('qr.key', licenses))
  manatee.register('pdf417', _.get('pdf417.name', licenses), _.get('pdf417.key', licenses))
}

function cancel () {
  // TODO: Use AbortSignal with the camera streamer to cancel a scan
  cancelFlag = true
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

function scanQR (callback) {
  scan('qr', callback, function (modeConfig, width, height, frame, greyscale, _callback) {
    const rgba8 = jpg.decompressSync(frame, { format: jpg.FORMAT_RGBA8 })
    const r = jsQR(rgba8.data, rgba8.width, rgba8.height, { inversionAttempts: 'dontInvert' })
    if (!r) return _callback()
    _callback(null, r.data)
  })
}

function scanPDF417 (callback, idCardStillsCallback) {
  const photosTaken = {
    1: true,
    2: true,
    3: true,
    4: true,
    5: true
  }
  const timerInit = new Date().getTime()

  scan('photoId', callback, function (modeConfig, width, height, frame, greyscale, _callback) {

    var timeChecker = new Date().getTime()
    let secondsPassed = Math.floor((timeChecker - timerInit) / 1000)
    var result = manatee.scanPDF417(greyscale, width, height)
    if (!result) {
      if (photosTaken[secondsPassed]) {
        photosTaken[secondsPassed] = false
        idCardStillsCallback(frame)
      }
      return _callback(null, null)
    }
    var parsed = Pdf417Parser.parse(result)
    if (!parsed) {
      if (photosTaken[secondsPassed]) {
        photosTaken[secondsPassed] = false
        idCardStillsCallback(frame)
      }
      return _callback(null, null)
    }
    parsed.raw = result.toString()
    _callback(null, parsed)
  })
}

function scanPhoto (callback) {
  scan('photoId', callback, function (modeConfig, width, height, frame, greyscale, _callback) {
    const detected = supyo.detect(greyscale, width, height, {
      minSize: modeConfig.minFaceSize || 100,
      qualityThreshold: modeConfig.threshold || 20,
      verbose: false
    })

    if (!detected) return _callback(null, null)
    _callback(null, frame)
  })
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
  scanQR((err, res) => {
    if (err) return callback(err)
    if (!res) return callback()
    return callback(null, res.toString())
  })
}

function scanMainQR (cryptoCode, callback) {
  scanQR(function (err, result) {
    if (err) return callback(err)
    if (!result) return callback(null, null)

    var resultStr = result.toString()
    console.log('DEBUG55: %s', resultStr)

    const network = 'main'
    try {
      callback(null, coinUtils.parseUrl(cryptoCode, network, resultStr))
    } catch (error) {
      callback(error)
    }
  })
}

function scanPK (callback) {
  scanQR(function (err, result) {
    if (err) return callback(err)
    if (!result) return callback(null, null)

    callback(null, result.toString())
  })
}

function scanPhotoCard (callback) {
  scanPhoto(function (err, result) {
    if (err) return callback(err)
    if (!result) return callback(null, null)

    callback(null, result)
  })
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
