var v4l2camera = require('v4l2camera')
var jpg = require('jpeg-turbo')
var manatee = require('manatee')
// var supyo = require('supyo')
var ICAP = require('ethereumjs-icap')
var url = require('url')
var bitcoinAddressValidator = require('bitcoin-address')
var Pdf417Parser = require('./compliance/parsepdf417')
var ethereumUtils = require('./eth-utils')

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
//  scanPhotoID: scanPhotoID,
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

  setConfig(width, height)

  cam.start()
  opened = true

  var handle = setInterval(capture, 100)

  function capture () {
    if (processing) return
    processing = true

    if (cancelFlag) {
      clearInterval(handle)
      cam.stop(() => {
        processing = false
        opened = false
        return resultCallback()
      })

      return
    }

    cam.capture(function (success) {
      if (!success) return
      var frame = cam.frameRaw()
      var greyscale = jpg.decompressSync(frame, {format: jpg.FORMAT_GRAY})

      captureCallback(frame, greyscale, function (err, result) {
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
  scan('qr', callback, function (frame, greyscale, _callback) {
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

// function scanPhotoID (callback) {
//   scan('photoId', callback, function (frame, greyscale, _callback) {
//     var detected = supyo.detect(greyscale, width, height)
//     if (!detected) return _callback()
//     _callback(null, frame)
//   })
// }

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

    switch (cryptoCode) {
      case 'BTC':
        callback(null, processBitcoinURI(resultStr))
        break
      case 'ETH':
        callback(null, parseEthURI(resultStr))
        break
      default:
        throw new Error('Unsupported coin: ' + cryptoCode)
    }
  })
}

function processBitcoinURI (data) {
  var address = parseBitcoinURI(data)
  if (!address) return null
  if (!bitcoinAddressValidator.validate(address)) {
    console.log('Invalid bitcoin address: %s', address)
    return null
  }
  return address
}

function parseBitcoinURI (uri) {
  var res = /^(bitcoin:\/{0,2})?(\w+)/.exec(uri)
  var address = res && res[2]
  if (!address) {
    return null
  } else return address
}

function isValidEthAddress (address) {
  if (address.toUpperCase() === address || address.toLowerCase() === address) {
    if (address.indexOf('0x') !== 0) return false
    return true
  }

  return ethereumUtils.isChecksumAddress(address)
}

function parseEthURI (uri) {
  try {
    var rec = url.parse(uri)
    if (rec.protocol === 'iban:') {
      if (!rec.host) return null
      var icap = rec.host.toUpperCase()
      return ICAP.toAddress(icap)
    }

    var address = rec.path || rec.host
    if (address && isValidEthAddress(address)) return address

    return null
  } catch (e) {
    return null
  }
}
