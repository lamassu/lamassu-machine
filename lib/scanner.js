const fs = require('fs')
const os = require('os')
const path = require('path')

const _ = require('lodash/fp')
const Pdf417Parser = require('./compliance/parsepdf417')
const { utils: coinUtils } = require('@lamassu/coins')
const cameraStreamer = require('./camera-streamer')
const rmrf = require('./rmrf')

let configuration = null
let kogoroshiya = null
let DEFAULT_FPS = 10

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
    width: 1920,
    height: 1080
  }
]

const maxCamResolutionPhotoId = [
  {
    width: 1280,
    height: 1024
  }
]

const outCallback2inCallback = callback =>
  (err, frame) =>
    err ? callback(err) :
    !frame ? callback(null, null) :
    callback(null, frame)

const mode2conf = mode =>
  mode === 'facephoto' ? 'frontFacingCamera' : 'scanner'

const getCameraDevice = mode => {
  const config = _.get(mode2conf(mode), configuration)

  if (mode === 'qr' && config && config.qrDevice) {
    return config.qrDevice
  }

  return _.get('device', config)
}

const getCameraConfig = mode =>
  _.get([mode2conf(mode), mode], configuration)

const setDefaultFPS = fps => { DEFAULT_FPS = fps }

function setConfig (formats, mode) {
  const isQRCodeMode = mode === 'qr'
  const isPhotoIdMode = mode === 'photoId'

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

  const format = _.flow(
    _.orderBy(pixelRes, ['desc']),
    _.find(isSuitableRes)
  )(formats)

  if (!format) throw new Error('Unsupported cam resolution!')
  return format
}

const pickFormat = mode => formats => setConfig(formats, mode)

function config (_configuration) {
  configuration = _configuration
}

const prepareForCapture = ()=>{}

const isCancelledError = err => err.cancelled
const isAbortError = err => err.name === 'AbortError'
const shouldIgnoreError = err => isCancelledError(err) || isAbortError(err)

const clear_kogoroshiya = () => {
  kogoroshiya = null
}

const replace_kogoroshiya = (atarashii_kogoroshiya) => {
  if (kogoroshiya) kogoroshiya()
  kogoroshiya = atarashii_kogoroshiya
}

const cancel = () => {
  replace_kogoroshiya(null)
  return false
}

const isOpened = () => !!kogoroshiya

const hasCamera = mode => {
  const device = getCameraDevice(mode)
  return device ? cameraStreamer.hasCamera(device) : Promise.resolve(false)
}

const maybeTmpdir = save =>
  !save ?
    Promise.resolve(null) :
    new Promise((resolve, reject) =>
      fs.mkdtemp(
        path.join(os.tmpdir(), 'failed-scans-'),
        (err, folder) => {
          if (err) {
            console.error(err)
            return resolve(null) /* cameraStreamer ignores the tmpdir if null */
          }
          resolve(folder)
        }
      )
    )

const scanQR = (saveFailedScans, callback) => {
  maybeTmpdir(saveFailedScans)
    .then(tmpdir => {
      const [korose, promise] = cameraStreamer.scanQR(getCameraDevice('qr'), pickFormat('qr'), DEFAULT_FPS, tmpdir)
      replace_kogoroshiya(korose)
      promise
        .then(result => {
          clear_kogoroshiya()
          callback(null, result ? result.toString() : result)
        })
        .catch(error => {
          clear_kogoroshiya()
          shouldIgnoreError(error) ? callback(null, null) : callback(error, null)
        })
    })
}

const scanPDF417 = (callback, idCardStillsCallback) => {
  const saveFailedScans = dirs => Promise.all(dirs.map(
      dir => fsPromises.readdir(dir)
        .catch(err => {
          console.error(err)
          return []
        })
        .then(_.map(fname => path.join(dir, fname)))
    ))
    .then(_.flow(
      _.flatten,
      failedScans => _.chunk(_.round(_.size(failedScans)/6), failedScans),
      _.map(failedScanGroup =>
        fsPromises.readFile(failedScanGroup[0])
          .then(idCardStillsCallback))
          .catch(console.error)
    ))
    .catch(console.error)
    then(() => Promise.all(dirs.map(rmrf)))

  const mode = 'photoId'
  const device = getCameraDevice(mode)
  const pickfmt = pickFormat(mode)

  const resolveScan = (tmpdirs, promise) =>
    promise
      .then(result => {
        clear_kogoroshiya()
        return result
      })
      .then(result => Promise.all([
        result,
        Pdf417Parser.parse(result),
        saveFailedScans(tmpdirs)
      ]))
      .then(([result, parsed, _]) => {
        parsed = parsed || null
        if (parsed) parsed.raw = result.toString()
        callback(null, parsed)
      })
      .catch(err => {
        clear_kogoroshiya()
        saveFailedScans(tmpdirs)
          .then(() => shouldIgnoreError(err) ? callback(null, null) : callback(err, null))
      })

  maybeTmpdir(true)
    .then(tmpdir => {
      const tmpdirs = tmpdir ? [tmpdir] : []
      const [korose, promise] = cameraStreamer.scanPDF417(device, pickfmt, DEFAULT_FPS, tmpdir)
      replace_kogoroshiya(korose)
      return resolveScan(tmpdirs, promise)
    })
}

const detectFace = (mode, minsizeDef, cutoffDef, callback) => {
  const device = getCameraDevice(mode)
  const modeConfig = getCameraConfig(mode)
  const minsize = _.defaultTo(minsizeDef, _.get(['minFaceSize'], modeConfig))
  const cutoff = _.defaultTo(cutoffDef, _.get(['threshold'], modeConfig))
  const [korose, promise] = cameraStreamer.detectFace(device, pickFormat(mode), DEFAULT_FPS, minsize, cutoff)
  replace_kogoroshiya(korose)
  promise
    .then(frame => {
      clear_kogoroshiya()
      callback(null, frame)
    })
    .catch(error => {
      clear_kogoroshiya()
      shouldIgnoreError(error) ? callback(null, null) : callback(error, null)
    })
}

const scanPhoto = callback => detectFace('photoId', 180, 20, callback)
const scanFacephoto = callback => detectFace('facephoto', 180, 20, callback)

const scanPairingCode = (saveFailedScans, callback) =>
  scanQR(saveFailedScans, outCallback2inCallback(callback))

const scanMainQR = (cryptoCode, saveFailedScans, callback) =>
  scanQR(saveFailedScans, (err, result) => {
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

const scanPhotoCard = callback =>
  scanPhoto(outCallback2inCallback(callback))

const takeFacephoto = callback =>
  scanFacephoto(outCallback2inCallback(callback))

const delayedshot = (mode, delay) => {
  const [korose, promise] = cameraStreamer.delayedshot(getCameraDevice(mode), pickFormat(mode), DEFAULT_FPS, delay)
  replace_kogoroshiya(korose)
  return promise
    .then(frame => {
      clear_kogoroshiya()
      return frame
    })
    .catch(err => {
      clear_kogoroshiya()
      return Promise.reject(err)
    })
}

const delayedFacephoto = (delay, callback) => delayedshot('facephoto', delay)
  .then(it => callback(null, it))
  .catch(err => callback(err, null))

const delayedPhoto = (delay, callback) => delayedshot('photoId', delay)
  .then(it => callback(null, it))
  .catch(err => callback(err, null))

module.exports = {
  config,
  prepareForCapture,
  setDefaultFPS,
  scanPairingCode,
  scanMainQR,
  scanPDF417,
  scanPhotoCard,
  takeFacephoto,
  cancel,
  isOpened,
  scanPK: scanPairingCode,
  hasCamera,
  takeFacePhotoTC: takeFacephoto,
  delayedFacephoto,
  delayedPhoto
}
