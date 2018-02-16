const actionEmitter = require('../action-emitter')

const lc = require('./led-control')

module.exports = {run}

function unauthorizedSequence () {
  if (!actionEmitter.isDoorSecured()) return
  return lc.timedPulse(lc.LEDS.doorLeds, lc.COLORS.red, 1000)
}

function doorSecured () {
  return lc.lightDown()
}

function doorNotSecured () {
  return lc.lightUp({range: lc.LEDS.doorLeds, color: lc.COLORS.amazonite, type: 'solid'})
}

function processFob (event) {
  if (!actionEmitter.isDoorSecured()) return

  switch (event.action) {
    case 'unauthorized':
      return unauthorizedSequence()
    case 'registered':
      return lc.timedPulse(lc.LEDS.doorLeds, lc.COLORS.orange, 1000)
  }
}

function processDoor (event) {
  switch (event.action) {
    case 'doorSecured':
      return doorSecured()
    case 'doorNotSecured':
      return doorNotSecured()
  }
}

function processDoorManager (event) {
  switch (event.action) {
    case 'doorSequenceOn':
      return lc.lightUp({range: lc.LEDS.doorLeds, color: lc.COLORS.amazonite, type: 'pulse'})
    case 'doorSequenceOff':
      return lc.lightDown()
  }
}

function run () {
  console.log('DEBUG100')
  actionEmitter.on('fob', processFob)
  actionEmitter.on('door', processDoor)
  actionEmitter.on('doorManager', processDoorManager)
  return Promise.resolve()
}
