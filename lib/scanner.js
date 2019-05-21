const _ = require('lodash/fp')
const Pdf417Parser = require('./compliance/parsepdf417')
const coinUtils = require('./coins/utils')
const v4l2camera = require('v4l2camera')
const jpg = require('jpeg-turbo')
const manatee = require('manatee')

let configuration = null
let cancelFlag = false
let opened = false
let processing = false
let camera = null
let closing = false

module.exports = {
  config,
  scanPairingCode,
  scanMainQR,
  scanPDF417,
  scanPhotoCard,
  cancel,
  isOpened,
  scanPK
}

function setConfig (width, height, cam) {
  const format = cam.formats.filter(f => f.formatName === 'MJPG' &&
    f.width === width &&
    f.height === height
  )[0]

  if (!format) throw new Error('Unsupported cam resolution: %dx%d', width, height)
  cam.configSet(format)
}

function config (_configuration) {
  configuration = _configuration

  const licenses = _.get('scanner.manatee.license', configuration)
  manatee.register('qr', _.get('qr.name', licenses), _.get('qr.key', licenses))
  manatee.register('pdf417', _.get('pdf417.name', licenses), _.get('pdf417.key', licenses))

  const mode = _.defaultTo(
    _.get('scanner.photoId', configuration),
    _.get('scanner.photoCard', configuration))

  const opts = _.extendAll({}, mode, {
    device: _.get('scanner.device', configuration),

    debug: true,
    verbose: false
  })

  camera = require('@lamassu/camera-wrapper')
  camera.config(opts)
}

function cancel () {
  cancelFlag = true
  camera && camera.closeCamera()
}

function isOpened () {
  return opened
}

// resultCallback returns final scan result
// captureCallback returns result of a frame capture
function scan (mode, resultCallback, captureCallback) {
  if (opened) {
    console.log("Camera is already open. Shouldn't happen.")
    return resultCallback(new Error('Camera open'))
  }

  const device = _.get('scanner.device', configuration)
  var modeConfig = _.get(['scanner', mode], configuration)
  console.log('Opening v4l2camera device: ' + device + ' with mode: ' + mode, modeConfig)
  var cam = new v4l2camera.Camera(device)
  var width = modeConfig.width
  var height = modeConfig.height

  cancelFlag = false

  setConfig(width, height, cam)

  cam.start()
  opened = true

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
          return resultCallback()
        })
      }

      return
    }

    if (processing) return
    processing = true

    cam.capture(function (success) {
      if (!success) return
      var frame = Buffer.from(cam.frameRaw())
      var greyscale = jpg.decompressSync(frame, {format: jpg.FORMAT_GRAY})

      captureCallback(width, height, frame, greyscale.data, function (err, result) {
        if (!err && !result && !cancelFlag) {
          processing = false
          return
        }

        clearInterval(handle)
        cam.stop(() => {
          processing = false
          opened = false
          return resultCallback(err, result)
        })
      })
    })
  }
}

function scanQR (callback) {
  scan('qr', callback, function (width, height, frame, greyscale, _callback) {
    var result = manatee.scanQR(greyscale, width, height)
    if (!result) return _callback()
    _callback(null, result.toString())
  })
}

function scanPDF417 (callback) {
  scan('photoId', callback, function (width, height, frame, greyscale, _callback) {
    var result = manatee.scanPDF417(greyscale, width, height)
    if (!result) return _callback(null, null)
    var parsed = Pdf417Parser.parse(result)
    if (!parsed) return _callback(null, null)
    _callback(null, parsed)
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

    var resultStr = result.toString()
    try {
      callback(null, resultStr)
    } catch (error) {
      callback(error)
    }
  })
}

function scanPhotoCard (callback) {
  cancelFlag = false

  if (!camera) {
    return callback(new Error('First initialize the camera-wrapper'))
  }

  var handle = setInterval(() => {
    if (cancelFlag) {
      enhancedCallback()
    }
  }, 100)

  let enhancedCallback = (err, succ) => {
    clearInterval(handle)
    callback(err, succ)
  }

  const opts = _.extend({
    faceDetect: true,
    onError: callback,
    onFaceDetected: frameRaw => {
      enhancedCallback(null, frameRaw)

      // if onFaceDetected callback returned false
      // it means that we can close the camera
      return false
    }
  }, config)

  if (!camera.openCamera(opts)) {
    enhancedCallback(new Error('Unable to open camera-wrapper'))
  }
}
