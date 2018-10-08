'use strict'

const _ = require('lodash/fp')
const sizeOf = require('image-size')
const fs = require('fs')

let frame = null
let opened = false
let opts = {}
let handle = false

exports.config = function init (config) {
  frame = _.get('brain.mockCameraImage', config)

  return this
}

exports.isOpened = function isOpened () { return opened }

exports.open = function open (_opts) {
  opts = _opts
  opened = !_.isEmpty(frame)

  handle = fakeFrameReader()

  return opened
}

exports.getFrameSize = function getFrameSize () {
  if (!opened) {
    return {
      width: 0,
      height: 0
    }
  }

  /** @type {Object} */
  try {
    const sizes = sizeOf(frame)
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
  opts = {}
  opened = false
  handle && handle.cancel() && (handle = false)

  return true
}

const fakeFrameReader = _.debounce(5000, () => {
  handle = false

  const cb = _.get('frameCallback', opts)
  if (!_.isFunction(cb)) return

  try {
    const frameRaw = fs.readFileSync(frame)
    cb(null, frameRaw, /* faceDetected */ true)
  } catch (err) {
    cb(err, null, false)
  }
})
