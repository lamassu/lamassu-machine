const _ = require('lodash/fp')

let configuration = null
let camera = null
let cancelFlag = false

module.exports = {
  config,
  takeFacephoto
}

function config (_configuration) {
  configuration = _configuration

  const mode = _.defaultTo(
    _.get('frontFacingCamera.facephoto', configuration),
    _.get('scanner.photoCard', configuration))

  const opts = _.extendAll({}, mode, {
    device: _.get('frontFacingCamera.device', configuration),
    debug: true,
    verbose: false
  })

  camera = require('@lamassu/camera-wrapper')
  console.log(opts)
  camera.config(opts)
}

function takeFacephoto (callback) {
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
