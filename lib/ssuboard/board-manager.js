const pSeries = require('p-series')

const io = require('./io')
const fobManager = require('./fob-manager')
const doorManager = require('./door-manager')
const ledManager = require('./led-manager')

module.exports = { run }

function run () {
  const tasks = [
    io.run,
    fobManager.run,
    ledManager.run,
    doorManager.run
  ]

  return pSeries(tasks)
}
