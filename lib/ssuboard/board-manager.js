const pSeries = require('p-series')

const io = require('./io')
const nfc = require('./nfc')
const fob = require('./fob')
const doorManager = require('./door-manager')
const ledManager = require('./led-manager')

module.exports = {run}

function run () {
  const tasks = [
    io.run,
    fob.run,
    ledManager.run,
    doorManager.run
  ]
  return pSeries(tasks)
}
