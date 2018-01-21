const fs = require('fs')
const jpg = require('jpeg-turbo')
const manatee = require('manatee')
const microtime = require('microtime')
const _ = require('lodash/fp')

const licenses = require('../licenses.json').scanner.manatee.license

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

function printStats () {
  const names = _.keys(ons)

  _.forEach(name => {
    console.log(`${name}: [${counts[name]}] ${(intervals[name] / counts[name]) / 1000} ms`)
  }, names)
}

manatee.register('qr', licenses.qr.name, licenses.qr.key)

const frame = fs.readFileSync('./qr1-small.jpg')
const greyscale = jpg.decompressSync(frame, {format: jpg.FORMAT_GRAY})

function parse () {
  const result = manatee.scanQR(greyscale.data, 640, 360)
  // console.log(result.toString())
}

console.log('Running...')
for (let i = 0; i < 500; i++) {
  on('manatee')
  parse()
  off('manatee')
}

printStats()
