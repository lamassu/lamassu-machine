const actionEmitter = require('../action-emitter')

const lc = require('./led-control')

module.exports = {run}

let isDoorSecured = null

function doorPopSequence () {
  return lc.timedPulse(lc.LEDS.doorLeds, lc.COLORS.amazonite, 3000)
  .then(() => actionEmitter.emit('doorManager', {action: 'popDoor'}))
}

function unauthorizedSequence () {
  return lc.timedPulse(lc.LEDS.doorLeds, lc.COLORS.red, 1000)
}

function doorSecured () {
  isDoorSecured = true
  return lc.lightDown()
}

function doorNotSecured () {
  console.log('DEBUG102')
  isDoorSecured = false
  return lc.lightUp({range: lc.LEDS.doorLeds, color: lc.COLORS.amazonite, type: 'solid'})
}

function processFob (event) {
  if (!isDoorSecured) return

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
