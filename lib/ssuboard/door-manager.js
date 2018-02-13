const actionEmitter = require('../action-emitter')

const lc = require('./led-control')

module.exports = {run}

function doorPopSequence () {
  return lc.timedPulse(lc.LEDS.doorLeds, lc.COLORS.amazonite, 3000)
  .then(() => actionEmitter.emit('doorManager', {action: 'popDoor'}))
}

function unauthorizedSequence () {
  return lc.timedPulse(lc.LEDS.doorLeds, lc.COLORS.red, 1000)
}

function doorSecured () {
  return lc.lightDown()
}

function doorNotSecured () {
  console.log('DEBUG102')
  return lc.lightUp({range: lc.LEDS.doorLeds, color: lc.COLORS.amazonite, type: 'pulse'})
}

function processFob (event) {
  switch (event.action) {
    case 'authorized':
      return doorPopSequence()
    case 'unauthorized':
      return unauthorizedSequence()
  }
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

  return Promise.resolve()
}
