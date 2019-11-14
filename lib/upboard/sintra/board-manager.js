const pSeries = require('p-series')

const ledManager = require('../../ssuboard/led-manager')

module.exports = { run }

function run () {
  const tasks = [
    ledManager.run
  ]

  return pSeries(tasks)
}
