'use strict'

var _ = require('lodash/fp')
var fs = require('fs')

/**
 * The complete list of options to run this module
 * @typedef {Object} CameraOpts
 * @property {boolean} debug - Indicates whether or not the debugging messages are displayed
 * @property {boolean} verbose - Indicates whether or not the native process debugging messages are displayed
 *
 * @property {number|string} device - Camera device to open (example: 0, '/dev/video0')
 * @property {number} width - Image width
 * @property {number} height - Image height
 * @property {string} codec - Image format (only .jpg supported for now)
 * @property {boolean} singleShot - Return a single frame and close the camera (camera shot mode)
 *
 * @property {boolean} faceDetected - Indicates whether or not run the face detect algorithm
 * @property {number} threshold - Face recognition quality threshold (higher means more accuracy) default: 6.5
 * @property {number} threshold2 - Face recognition second threshold (higher means more accuracy) default: 100
 * @property {number} minFaceSize (pixel) - Minimum face size (in pixel) default: 128
 * @property {boolean} debugWindow - Display the native OpenCV highgui window
 * @property {boolean} debugTimes - Indicates whether or not the native processing times are displayed
 *
 * @property {(Error) => bool} onError - callback function when an error occurs
 * @property {(Buffer) => bool} onFrame - callback function called for every captured frame. return false to close the camera
 * @property {(Buffer) => bool} onFaceDetected - callback function called when a face is captured. return false to close the camera
 *
 * @property {boolean} mock - Indicates whether or not run the mocked camera-wrapper module (instead of the native one)
 * @property {string} mockImage - Image path to return within the mocked camera-wrapper
 */
var defaultOpts = {
  debug: true,
  verbose: false,

  // camera settings:
  codec: '.jpg',
  singleShot: false,

  // face detect settings:
  faceDetect: false,
  threshold: 6.5,
  threshold2: 100,
  minFaceSize: 128,
  debugWindow: false,
  debugTime: false,

  // mocked camera-wrapper version
  mock: false
}

var _camera = false
/** @var {CameraOpts} */
var _opts = _.clone(defaultOpts)
/** @var {Buffer} */
var lastFrame = Buffer.alloc(0)

/**
 * Debug logging function
 */
function debug () {
  if (_.get('debug', _opts)) {
    var args = ['camera ::'].concat(Array.prototype.slice.call(arguments))
    console.log.apply(console, args)
  }
}

/**
 * Error logging function
 */
function error () {
  var args = ['camera ::'].concat(Array.prototype.slice.call(arguments))
  console.error.apply(console, args)
}

/**
 * The mocked version is enabled only when
 * {mock: true}
 * and
 * {mockImage: 'path/to/an/existing/image'}
 * @returns {boolean}
 */
function isMocked () {
  if (!_.get('mock', _opts)) {
    return false
  }

  var image = _.get('mockImage', _opts)
  if (!image) {
    return false
  }

  if (!fs.existsSync(image)) {
    error('mock and mockImage were set but the mocked image doens\' exists!', {_opts})
    return false
  }

  return true
}

/**
 * Instantiate the camera-wrapper module to load
 * @returns {boolean}
 */
function camera () {
  if (!_camera) {
    if (!isMocked()) {
      _camera = require('../../build/Release/camera-wrapper.node')
    } else {
      _camera = require('../mocks/camera-wrapper')
    }
  }

  return _camera
}

/**
 * Set the module opts to be applied from the next
 * cameraOpen method call
 * @param {CameraOpts} [config]
 * @returns {CameraOpts}
 */
exports.config = function (config) {
  // reset the loaded module
  _camera = false

  // set the instance opts
  if (!_.isEmpty(config)) {
    _opts = _.extendAll({}, defaultOpts, config)
    debug('config with opts', _opts)
  }

  return _.cloneDeep(_opts)
}

/**
 * Open the camera and start the acquisition
 * @param {CameraOpts} [opts]
 * @return {boolean} Indicates whether or not camera was opened successfully
 * @throws if the native camera-wrapper module raises some exception
 */
exports.openCamera = function openCamera (opts) {
  _opts = _.extendAll({}, _opts, opts, {
    frameCallback: function () {
      if (onFrameCallback.apply(null, arguments) === false) {
        exports.closeCamera()
      }
    }
  })
  debug('open with opts', _opts)

  if (camera().isOpened()) {
    debug('already opened')

    return false
  }

  return camera().open(_opts)
}

/**
 * Return true if the camera is on
 * @return {boolean}
 */
exports.isOpened = function isOpened () {
  return camera().isOpened()
}

/**
 * Return camera frame size
 * @return {{width: number, height: number}}
 */
exports.getFrameSize = function getFrameSize () {
  return camera().getFrameSize()
}

/**
 * @return {boolean} Indicates whether or not camera was closed successfully
 */
exports.closeCamera = function closeCamera () {
  if (!camera().isOpened()) {
    debug('already closed')

    return false
  }

  debug('closing camera')
  camera().close()

  return true
}

/**
 * Get the last captured frame
 * @return {Buffer}
 */
exports.getFrame = function getLastFrame () {
  return lastFrame
}

/**
 * Receive events from the native module
 * @param {Error} err
 * @param {Buffer} frameRaw
 * @param {boolean} faceDetect
 * @returns {boolean}
 */
function onFrameCallback (err, frameRaw, faceDetect) {
  if (_.get('onError', _opts) && _.isError(err)) {
    _opts.onError(err)

    return false // close the camera
  }

  if (!_.isError(err)) {
    lastFrame = Buffer.from(frameRaw)
  }

  // if faceDetect === true
  // it means that the face detector is enabled
  // and we should call the onFaceDetected callback
  if (faceDetect && _.get('onFaceDetected', _opts)) {
    if (_opts.onFaceDetected(lastFrame) === false) {
      debug('onFaceDetected returned false, closing camera')

      // onFaceDetected callback returned false
      // it means that we can close the camera
      return false
    }
  }

  if (_.get('onFrame', _opts)) {
    if (_opts.onFrame(lastFrame) === false) {
      debug('onFrame returned false, closing camera')

      // onFrame callback returned false
      // it means that we can close the camera
      return false
    }
  }

  if (_.get('singleShot', _opts)) {
    debug('configured with {singleShot: true}, closing camera')

    // fetch the frame
    // and close the camera
    return false
  }
}
