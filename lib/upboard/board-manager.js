const pSeries = require('p-series')

const ledManager = require('./led-manager')

module.exports = { run }

function run () {
  const tasks = [
    ledManager.run
  ]

  return pSeries(tasks)
}
