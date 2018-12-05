const actionEmitter = require('../action-emitter')

const lc = require('./led-control')

module.exports = {run}

function unauthorizedSequence () {
  if (!actionEmitter.isDoorSecured()) return
  return lc.timed({range: lc.LEDS.doorLeds, color: lc.COLORS.red, type: 'pulse'}, 1000)
}

function doorSecured () {
  return lc.lightDown()
}

function doorNotSecured () {
  return solidUp(lc.LEDS.doorLeds, lc.COLORS.amazonite)
}

function processFob (event) {
  if (!actionEmitter.isDoorSecured()) return

  switch (event.action) {
    case 'unauthorized':
      return unauthorizedSequence()
    case 'registered':
      return lc.timed({range: lc.LEDS.doorLeds, color: lc.COLORS.orange, type: 'pulse'}, 1000)
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
      return pulseUp(lc.LEDS.doorLeds, lc.COLORS.orange)
    case 'doorSequenceOff':
      return lc.lightDown()
  }
}

function pulseUp (range, color) {
  return lc.lightUp({range, color, type: 'pulse'})
}

function solidUp (range, color) {
  return lc.lightUp({range, color, type: 'solid'})
}

function processBrain (event) {
  switch (event.action) {
    case 'billValidatorPending':
      return pulseUp(lc.LEDS.validatorLeds, lc.COLORS.amazonite)
    case 'billValidatorAccepting':
      return pulseUp(lc.LEDS.validatorLeds, lc.COLORS.orange)
    case 'billValidatorRejecting':
      return pulseUp(lc.LEDS.validatorLeds, lc.COLORS.red)

    case 'billDispenserDispensing':
      return solidUp(lc.LEDS.dispenserLeds, lc.COLORS.amazonite)
    case 'billDispenserDispensed':
      return pulseUp(lc.LEDS.dispenserLeds, lc.COLORS.orange)

    case 'scanBayLightOn':
      return solidUp(lc.LEDS.scanBayLeds, lc.COLORS.white)

    case 'billValidatorOff':
    case 'billDispenserCollected':
    case 'scanBayLightOff':
    case 'ledsOff':
    case 'forceOff':
      return lc.lightDown()
  }
}

function processDispenseGenerator (event) {
  switch (event.action) {
    case 'billDispenserDispensed':
      return pulseUp(lc.LEDS.dispenserLeds, lc.COLORS.orange)
    default:
      break
  }
}

function run () {
  console.log('DEBUG100')
  actionEmitter.on('fob', processFob)
  actionEmitter.on('door', processDoor)
  actionEmitter.on('doorManager', processDoorManager)
  actionEmitter.on('brain', processBrain)
  actionEmitter.on('dispenseGenerator', processDispenseGenerator)
  return Promise.resolve()
}
