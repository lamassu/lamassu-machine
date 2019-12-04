const pSeries = require('p-series')

const io = require('./io')
const fobManager = require('./fob-manager')
const doorManager = require('./door-manager')
const ledManager = require('./led-manager')

module.exports = { run }

function run () {
  const ledsPromise = ledManager.run()
    .catch(err => {
      console.log('ledManager error', err)
      throw err
    })

  const seriesPromise = pSeries([
    io.run,
    fobManager.run,
    doorManager.run
  ]).catch(err => console.log('boardManager error', err))

  return Promise.all([ledsPromise, seriesPromise])
}
