const pSeries = require('p-series')

const io = require('./io')
const fobManager = require('./fob-manager')
const doorManager = require('./door-manager')
const ledManager = require('./led-manager')

module.exports = { run }

function run () {
  ledManager.run()
    .catch(err => console.log('ledManager error', err))

  const tasks = [
    io.run,
    fobManager.run,
    doorManager.run
  ]

  return pSeries(tasks)
    .catch(err => console.log('boardManager error', err))
}
