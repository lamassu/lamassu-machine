const _ = require('lodash/fp')
const Pdf417Parser = require('./compliance/parsepdf417')
const { utils: coinUtils } = require('@lamassu/coins')
const cameraStreamer = require('./camera-streamer')

const selectedCamResolutions = {}

let configuration = null

const mudana_kogoroshiya = () => null
let kogoroshiya = mudana_kogoroshiya

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
}

const cancel = () => {
  // TODO: Use AbortSignal with the camera streamer to cancel a scan
  if (kogoroshiya) {
    kogoroshiya()
    kogoroshiya = mudana_kogoroshiya
  }
}

const isOpened = () => kogoroshiya != mudana_kogoroshiya

const hasCamera = mode => {
  const device = getCameraDevice(mode)
  return device ? cameraStreamer.hasCamera(device) : Promise.resolve(false)
}

const scanQR = callback => {
  const [korose, promise] = cameraStreamer.scanQR(getCameraDevice('qr'), pickFormat('qr'))
  /* TODO: There's a race condition here with cancel() from the outside -- see TODO there.  */
  kogoroshiya()
  kogoroshiya = korose
  return promise
    .then(result => callback(null, result ? result.toString() : result))
    .catch(error => callback(error, null))
}

const scanPDF417 = (callback, idCardStillsCallback) => {
  const photosTaken = {
    1: true,
    2: true,
    3: true,
    4: true,
    5: true
  }
  const timerInit = new Date().getTime()
  const mode = 'photoId'
  const device = getCameraDevice(mode)
  const pickfmt = pickFormat(mode)
  const takeonce = () => {
    /* TODO: There's a race condition here with cancel() from the outside -- see TODO there.  */
    const [korose, promise] = cameraStreamer.scanPDF417(device, pickfmt)
    kogoroshiya()
    kogoroshiya = korose
    return promise
      .then(result => {
        const parsed = Pdf417Parser.parse(result)
        if (parsed) {
          parsed.raw = result.toString()
          return callback(null, parsed)
        }

        const timeChecker = new Date().getTime()
        const secondsPassed = Math.floor((timeChecker - timerInit) / 1000)
        if (photosTaken[secondsPassed]) {
          photosTaken[secondsPassed] = false
          idCardStillsCallback(result)
        }

        return takeonce()
      })
      .catch(err => takeonce())
  }

  return takeonce()
}

const detectFace = (mode, minsizeDef, cutoffDef, callback) => {
  const device = getCameraDevice(mode)
  const modeConfig = getCameraConfig(mode)
  const minsize = modeConfig.minFaceSize || minsizeDef
  const cutoff = modeConfig.threshold || cutoffDef
  const [korose, promise] = cameraStreamer.detectFace(device, pickFormat(mode), minsize, cutoff)
  kogoroshiya = korose
  return promise
    .then(frame => callback(null, frame))
    .catch(error => callback(error, null))
}

const scanPhoto = callback => detectFace('photoId', 100, 20, callback)
const scanFacephoto = callback => detectFace('facephoto', 100, 20, callback)

const scanFacephotoTC = scanFacephoto

const scanPairingCode = callback =>
  scanQR((err, res) =>
    err ? callback(err) :
    !res ? callback(null, null) :
    callback(null, res)
  )

const scanMainQR = (cryptoCode, callback) =>
  scanQR((err, result) => {
    if (err) return callback(err)
    if (!result) return callback(null, null)

    console.log('DEBUG55: %s', result)

    const network = 'main'
    try {
      callback(null, coinUtils.parseUrl(cryptoCode, network, result))
    } catch (error) {
      callback(error)
    }
  })

const scanPK = scanPairingCode

const scanPhotoCard = callback =>
  scanPhoto((err, result) =>
    err ? callback(err) :
    !frame ? callback(null, null) : /* Shouldn't happen */
    callback(null, frame)
  )

const takeFacephoto = callback =>
  scanFacephoto((err, frame) =>
    err ? callback(err) :
    !frame ? callback(null, null) : /* Shouldn't happen */
    callback(null, frame)
  )

const takeFacePhotoTC = callback =>
  scanFacephotoTC((err, frame) =>
    err ? callback(err) :
    !frame ? callback(null, null) : /* Shouldn't happen */
    callback(null, frame)
  )
