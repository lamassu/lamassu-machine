'use strict'

var _ = require('lodash/fp')
var camera = require('../../build/Release/camera-wrapper.node')

var defaultOpts = {
  verbose: true,
  // width: 640,
  // height: 480,
  // input: '0',
  // codec: '.jpg',
  // frameCallback: function (frameRaw, faceDetected) {},
  faceDetect: false,
  singleShot: false
}

var liveOpts = {}
var lastFrame = Buffer.alloc(0)

/**
 * Open the camera and start the acquisition
 * @param {object} opts
 * @param {bool} [opts.verbose=true]
 * @param {number} [opts.width]
 * @param {number} [opts.height]
 * @param {string} [opts.input]
 * @param {string} [opts.codec]
 * @param {bool} [opts.faceDetect]
 * @param {(Buffer) => bool} [opts.onFrame] callback function with the frame attached. return false to close the camera
 * @param {(Buffer) => bool} [opts.onFaceDetected] callback function with the frame attached. return false to close the camera
 * @return {bool} true if the camera is opened successfully
 *                false if it's already opened
 * @throws if the camera cannot be opened
 *         or some argument is missing
 */
exports.openCamera = function openCamera (opts) {
  liveOpts = _.extend({frameCallback: onFrameCallback}, _.extend(defaultOpts, opts))

  if (camera.isOpened()) {
    _.get('verbose', liveOpts) && console.log('camera is already started')

    return false
  }

  _.get('verbose', liveOpts) && console.log('opening camera', liveOpts)
  return camera.open(liveOpts)
}

/**
 * Return true if the camera is started
 * @return {boolean}
 */
exports.isOpened = function isOpened () {
  return camera.isOpened()
}

/**
 * Return camera frame size
 * @return {width: number, height: number}
 */
exports.getFrameSize = function getFrameSize () {
  return camera.getFrameSize()
}

/**
 * @return {bool} true if the camera is closed successfully
 *                false if it's already closed
 */
exports.closeCamera = function closeCamera () {
  if (!camera.isOpened()) {
    _.get('verbose', liveOpts) && console.log('camera is already stopped')

    return false
  }

  _.get('verbose', liveOpts) && console.log('closing camera')
  camera.close()
  liveOpts = {}
  return true
}

/**
 * Get the last obtained camera frame
 * @return {Buffer}
 */
exports.getFrame = function getLastFrame () {
  return lastFrame
}

function onFrameCallback (frameRaw, faceDetect) {
  lastFrame = Buffer.from(frameRaw)

  // if faceDetect === true
  // it means that the face detector is enabled
  // and we should call the onFaceDetected callback
  if (faceDetect && _.get('onFaceDetected', liveOpts)) {
    if (liveOpts.onFaceDetected(lastFrame) === false) {
      _.get('verbose', liveOpts) && console.log('onFaceDetected returned false, closing camera')

      // onFaceDetected callback returned false
      // it means that we can close the camera
      return exports.closeCamera()
    }
  }

  if (_.get('onFrame', liveOpts)) {
    if (liveOpts.onFrame(lastFrame) === false) {
      _.get('verbose', liveOpts) && console.log('onFrame returned false, closing camera')

      // onFrame callback returned false
      // it means that we can close the camera
      return exports.closeCamera()
    }
  }

  if (_.get('singleShot', liveOpts)) {
    _.get('verbose', liveOpts) && console.log('running with {singleShot: true}, closing camera')

    // fetch the frame
    // and close the camera
    return exports.closeCamera()
  }
}
