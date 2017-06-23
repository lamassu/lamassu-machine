var v4l2camera = require('v4l2camera')
var jpg = require('jpeg-turbo')
var manatee = require('manatee')
var Pdf417Parser = require('./compliance/parsepdf417')
var coinUtils = require('./coins/utils')

var configuration = null
var width
var height
var cancelFlag = false

let opened = false
let processing = false

module.exports = {
  config: config,
  scanPairingCode: scanPairingCode,
  scanMainQR: scanMainQR,
  scanPDF417: scanPDF417,
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
  var licenses = configuration.manatee.license
  manatee.register('qr', licenses.qr.name, licenses.qr.key)
  manatee.register('pdf417', licenses.pdf417.name, licenses.pdf417.key)
}

function cancel () {
  cancelFlag = true
}

// resultCallback returns final scan result
// captureCallback returns result of a frame capture
function scan (mode, resultCallback, captureCallback) {
  if (opened) {
    console.log("Camera is already open. Shouldn't happen.")
    return resultCallback(new Error('Camera open'))
  }

  var cam = new v4l2camera.Camera(configuration.device)
  var modeConfig = configuration[mode]
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
  scan('photoId', callback, function (frame, greyscale, _callback) {
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

