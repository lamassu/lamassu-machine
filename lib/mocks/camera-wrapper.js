'use strict'

/**
 * Mimic the camera-wrapper native module behavior
 * @author "Fabio Cigliano"
 * @created 14/10/2018
 */

var _ = require('lodash/fp')
var sizeOf = require('image-size')
var fs = require('fs')

var _frame
var _opts = {}
var _handle
var _opened

exports.isOpened = function isOpened () {
  return _opened
}

exports.open = function open (config) {
  _opts = _.cloneDeep(config)
  _opened = true
  _handle = fakeFrameReader()

  return _opened
}

exports.getFrameSize = function getFrameSize () {
  if (!exports.isOpened() || !_frame) {
    return {
      width: 0,
      height: 0
    }
  }

  /** @type {Object} */
  try {
    const sizes = sizeOf(_frame)
    return {
      width: _.get('width', sizes),
      height: _.get('height', sizes)
    }
  } catch (err) {
    return {
      width: 0,
      height: 0
    }
  }
}

exports.close = function close () {
  _opened = false
  _handle && _handle.cancel() && (_handle = false)

  return true
}

const fakeFrameReader = _.debounce(1000, () => {
  _handle = false

  const cb = _.get('frameCallback', _opts)
  if (!_.isFunction(cb)) return

  try {
    _frame = fs.readFileSync(_.get('mockImage', _opts))
    cb(null, _frame, _.get('faceDetect', _opts))
  } catch (err) {
    cb(err, null, false)
  }
})
