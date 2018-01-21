const pWhilst = require('p-whilst')
const v4l2camera = require('v4l2camera')
const jpg = require('jpeg-turbo')
const microtime = require('microtime')
const _ = require('lodash/fp')

const ons = {}
const intervals = {}
const counts = {}

function on (name) {
  ons[name] = microtime.now()
}

function off (name) {
  const interval = microtime.now() - ons[name]
  intervals[name] = (intervals[name] || 0) + interval
  counts[name] = (counts[name] || 0) + 1
}

function setConfig (width, height, formatName, cam) {
  const format = cam.formats.filter(f => f.formatName === formatName &&
    f.width === width &&
    f.height === height
  )[0]

  if (!format) throw new Error('Unsupported cam resolution: %dx%d', width, height)
  cam.configSet(format)
}

function capture (cam) {
  return new Promise((resolve, reject) => {
    on('full-capture')
    on('capture')
    cam.capture(success => {
      off('capture')
      if (!success) return reject(new Error('cam error'))
      on('frame-raw')
      const frame = Buffer.from(cam.frameRaw())
      off('frame-raw')
      // on('greyscale')
      // const greyscale = jpg.decompressSync(frame, {format: jpg.FORMAT_GRAY})
      // off('greyscale')
      off('full-capture')
      return resolve()
    })
  })
}

function printStats () {
  const names = _.keys(ons)

  _.forEach(name => {
    console.log(`${name}: [${counts[name]}] ${(intervals[name] / counts[name]) / 1000} ms`)
  }, names)
}

function fullCapture () {
  return new Promise((resolve, reject) => {
    cam.start()

    return pWhilst(() => count++ < 500, () => capture(cam))
    .then(() => cam.stop(resolve))
  })
}

const cam = new v4l2camera.Camera('/dev/video0')
setConfig(1280, 720, 'YUYV', cam)

function simpleCapture () {
  return new Promise((resolve, reject) => {

    on('full-cam')
    on('start')
    cam.start()
    off('start')

    let capCount = 0

    return pWhilst(() => capCount++ < 20, () => capture(cam))
    .then(() => on('stop'))
    .then(() => cam.stop(resolve))
    .then(() => off('stop'))
    .then(() => off('full-cam'))
  })
}

let count = 0

// fullCapture()
pWhilst(() => count++ < 10, simpleCapture)
.then(printStats)
