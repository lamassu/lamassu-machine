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
      return lc.lightUp({range: lc.LEDS.doorLeds, color: lc.COLORS.orange, type: 'solid'})
    case 'doorSequenceOff':
      return lc.lightDown()
  }
}

function pulseDownUp (range, color) {
  return lc.lightDown()
    .then(() => {
      lc.lightUp({range, color, type: 'solid'})
    })
}

function processBrain (event) {
  switch (event.action) {
    case 'billValidatorPending':
      return pulseDownUp(lc.LEDS.validatorLeds, lc.COLORS.amazonite)
    case 'billValidatorAccepting':
      return pulseDownUp(lc.LEDS.validatorLeds, lc.COLORS.orange)
    case 'billValidatorRejecting':
      return pulseDownUp(lc.LEDS.validatorLeds, lc.COLORS.red)

    case 'billDispenserDispensing':
      return lc.lightUp({range: lc.LEDS.dispenserLeds, color: lc.COLORS.amazonite, type: 'solid'})
    case 'billDispenserDispensed':
      return pulseDownUp(lc.LEDS.dispenserLeds, lc.COLORS.orange)

    case 'scanBayLightOn':
      return lc.lightUp({range: lc.LEDS.scanBayLeds, color: lc.COLORS.white, type: 'solid'})

    case 'billValidatorOff':
    case 'billDispenserCollected':
    case 'scanBayLightOff':
    case 'ledsOff':
      return lc.lightDown()

    case 'forceOff':
      return lc.forceOff()
  }
}

function run () {
  console.log('DEBUG100')
  actionEmitter.on('fob', processFob)
  actionEmitter.on('door', processDoor)
  actionEmitter.on('doorManager', processDoorManager)
  actionEmitter.on('brain', processBrain)
  return Promise.resolve()
}
