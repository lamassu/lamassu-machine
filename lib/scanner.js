const _ = require('lodash/fp')
var v4l2camera = require('v4l2camera')
var jpg = require('jpeg-turbo')
var manatee = require('manatee')
var Pdf417Parser = require('./compliance/parsepdf417')
var coinUtils = require('./coins/utils')

var configuration = null
var cancelFlag = false

let opened = false
let processing = false
let camera = null

module.exports = {
  config: config,
  scanPairingCode: scanPairingCode,
  scanMainQR: scanMainQR,
  scanPDF417: scanPDF417,
  scanPhotoCard: scanPhotoCard,
  cancel: cancel
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
  var licenses = _.get('scanner.manatee.license', configuration)
  manatee.register('qr', _.get('qr.name', licenses), _.get('qr.key', licenses))
  manatee.register('pdf417', _.get('pdf417.name', licenses), _.get('pdf417.key', licenses))
  camera = require('./camera').config(_configuration)
}

function cancel () {
  cancelFlag = true
  camera && camera.closeCamera()
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
      clearInterval(handle)
      cam.stop(() => {
        processing = false
        opened = false
        return resultCallback()
      })

      return
    }

    if (processing) return
    processing = true

    cam.capture(function (success) {
      if (!success) return
      var frame = Buffer.from(cam.frameRaw())
      var greyscale = jpg.decompressSync(frame, {format: jpg.FORMAT_GRAY})

      captureCallback(width, height, frame, greyscale.data, function (err, result) {
        if (!err && !result) {
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
    return callback(null, coinUtils.parseUrl(cryptoCode, network, resultStr))
  })
}

function scanPhotoCard (callback) {
  if (!camera) {
    return callback(new Error('First initialize the camera-wrapper'))
  }

  var width = _.get('photoCard.width', configuration)
  var height = _.get('photoCard.height', configuration)

  if (!camera.openCamera({
    verbose: true,
    faceDetect: true,
    width,
    height,
    codec: '.jpg',
    onError: callback,
    onFaceDetected: frameRaw => {
      callback(null, frameRaw)

      // if onFaceDetected callback returned false
      // it means that we can close the camera
      return false
    }
  })) {
    callback(new Error('Unable to open camera-wrapper'))
  }
}
