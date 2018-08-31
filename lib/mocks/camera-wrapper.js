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
  const sizes = sizeOf(frame)
  return {
    width: sizes.width,
    height: sizes.height
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

  const frameRaw = fs.readFileSync(frame)
  cb(frameRaw, /* faceDetected */ true)
})
