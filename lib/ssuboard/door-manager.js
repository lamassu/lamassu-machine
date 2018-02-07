const process = require('process')

const actionEmitter = require('../action-emitter')

const lc = require('./led-control')

module.exports = {run}

function doorPopSequence () {
  return lc.timedPulse(lc.LEDS.DOOR_LEDS, lc.COLORS.orange, 3000)
  .then(() => actionEmitter.emit('doorManager', {action: 'doorPop'}))
}

function unauthorizedSequence () {
  return lc.timedPulse(lc.LEDS.DOOR_LEDS, lc.COLORS.red, 1000)
}

function processFob (event) {
  switch (event.action) {
    case 'authorized':
      return doorPopSequence()
    case 'unauthorized':
      return unauthorizedSequence()
  }
}

function doorSecured () {
  return lc.off()
}

function doorNotSecured () {
  console.log('DEBUG102')
  return lc.solid(lc.LEDS.DOOR_LEDS, lc.COLORS.orange)
}

function processDoor (event) {
  console.log('DEBUG101')
  switch (event.action) {
    case 'doorSecured':
      return doorSecured()
    case 'doorNotSecured':
      return doorNotSecured()
  }
}

function run () {
  console.log('DEBUG100')
  actionEmitter.on('fob', processFob)
  actionEmitter.on('door', processDoor)
}

process.on('unhandledRejection', console.log)
process.on('uncaughtException', console.log)

// runningScheme: the running scheme
// pendingScheme: the pending scheme
// Can only be one runningScheme. If we try to write a new scheme, it overwrites any existing pendingScheme.
// Switch pendingScheme to runningScheme on "off" state.
