const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const _ = require('lodash/fp')
const Pdf417Parser = require('./compliance/parsepdf417')
const { utils: coinUtils } = require('@lamassu/coins')
const cameraStreamer = require('./camera-streamer')

const IS_VERBOSE = require('minimist')(process.argv.slice(2)).devBoard

cameraStreamer.setVerbose(IS_VERBOSE)

let configuration = null
let kogoroshiya = null
const DEFAULT_FPS = 10
let current_fps = DEFAULT_FPS
const DEFAULT_DELAYEDSHOT_DELAY = 3
let delayedshot_delay = DEFAULT_DELAYEDSHOT_DELAY

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

const setFPS = fps => { current_fps = fps }

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
    _.find(isSuitableRes),
  )(formats)

  if (!format) throw new Error('Unsupported cam resolution!')
  return format
}

const pickFormat = mode => formats => setConfig(formats, mode)

function config (_configuration) {
  const getConfDelay = camera => _.defaultTo(DEFAULT_DELAYEDSHOT_DELAY, _.get([camera, 'diagnosticDelay'], configuration))
  configuration = _configuration
  delayedshot_delay = Math.max(getConfDelay('scanner'), getConfDelay('frontFacingCamera'))
}

const isCancelledError = err => err.cancelled
const isAbortError = err => err.name === 'AbortError'
const shouldIgnoreError = err => isCancelledError(err) || isAbortError(err)

const clear_kogoroshiya = () => {
  kogoroshiya = null
}

const replace_kogoroshiya = (atarashii_kogoroshiya) => {
  if (kogoroshiya) kogoroshiya.abort()
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
    fs.mkdtemp(path.join(os.tmpdir(), 'failed-scans-'))
      .catch(err => {
        console.error(err)
        return null /* cameraStreamer ignores the tmpdir if null */
      })

const scanQR = (_saveFailedScans, callback) => {
  const saveFailedScans = _saveFailedScans ?
    /* NOTE: _saveFailedScans() MUST NOT reject */
    dirs => _saveFailedScans(dirs).then(() => Promise.all(_.map(rmrf, dirs))) :
    () => {}
  maybeTmpdir(saveFailedScans)
    .then(tmpdir => {
      const tmpdirs = tmpdir ? [tmpdir] : []
      const [korose, promise] = cameraStreamer.scanQR(getCameraDevice('qr'), pickFormat('qr'), current_fps, tmpdir)
      replace_kogoroshiya(korose)
      promise
        .then(result => {
          clear_kogoroshiya()
          saveFailedScans(tmpdirs)
          callback(null, result ? result.toString() : result)
        })
        .catch(error => {
          clear_kogoroshiya()
          saveFailedScans(tmpdirs)
          shouldIgnoreError(error) ? callback(null, null) : callback(error, null)
        })
    })
}

const rmrf = dir =>
  fs.rm(dir, { force: true, recursive: true, maxRetries: 5 })
    .catch(err => console.log("Error removing failed scans directory (", dir, "): ", err))

const scanPDF417 = (callback, idCardStillsCallback) => {
  /* NOTE: idCardStillsCallback() MUST NOT reject */
  const saveFailedScans = dirs => idCardStillsCallback(dirs).then(() => Promise.all(_.map(rmrf, dirs)))

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
      const [korose, promise] = cameraStreamer.scanPDF417(device, pickfmt, current_fps, tmpdir)
      replace_kogoroshiya(korose)
      return resolveScan(tmpdirs, promise)
    })
}

const detectFace = (mode, minsizeDef, cutoffDef, callback) => {
  const device = getCameraDevice(mode)
  const modeConfig = getCameraConfig(mode)
  const minsize = _.defaultTo(minsizeDef, _.get(['minFaceSize'], modeConfig))
  const cutoff = _.defaultTo(cutoffDef, _.get(['threshold'], modeConfig))
  const [korose, promise] = cameraStreamer.detectFace(device, pickFormat(mode), current_fps, minsize, cutoff)
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

const delayedshot = (mode, device) => {
  const [korose, promise] = cameraStreamer.delayedshot(device || getCameraDevice(mode), pickFormat(mode), current_fps, delayedshot_delay)
  replace_kogoroshiya(korose)
  return promise
    .then(frame => {
      clear_kogoroshiya()
      return frame
    })
    .catch(err => {
      clear_kogoroshiya()
      return shouldIgnoreError(err) ? Promise.resolve(null) : Promise.reject(err)
    })
}

const delayedFacephoto = callback => {
  return delayedshot('facephoto')
    .then(it => callback(null, it))
    .catch(err => callback(err, null))
}
const delayedPhoto = callback => {
  return delayedshot('photoId')
    .then(it => callback(null, it))
    .catch(err => callback(err, null))
}

const diagnosticPhotos = () => {
  cameraStreamer.setVerbose(true)

  const response = {
    scan: null,
    front: null
  }

  return delayedshot('', '/dev/video-scan')
    .then((scan) => {
      if (scan) {
        response.scan = scan.toString('base64')
      }
    })
    .catch(() => {})
    .then(() => delayedshot('', '/dev/video-front'))
    .then((front) => {
      if (front) {
        response.front = front.toString('base64')
      }
    })
    .catch(() => {})
    .then(() => {
      cameraStreamer.setVerbose(IS_VERBOSE)
      return response
    })
}

const getDelayMS = () => delayedshot_delay*1000

module.exports = {
  config,
  setFPS,
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
  delayedPhoto,
  diagnosticPhotos,
  getDelayMS,
}
