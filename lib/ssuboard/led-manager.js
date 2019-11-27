const actionEmitter = require('../action-emitter')
const processDoorLib = require('./process-door')

const lc = require('../leds/led-control')
const LEDS = require('./led-addresses')

module.exports = { run }

function unauthorizedSequence () {
  if (!processDoorLib.isDoorSecured()) return
  return lc.timedPulse(LEDS.doorLeds, lc.COLORS.red, 1000)
}

function doorSecured () {
  return lc.lightDown()
}

function doorNotSecured () {
  return solidUp(LEDS.doorLeds, lc.COLORS.amazonite)
}

function processFob (event) {
  if (!processDoorLib.isDoorSecured()) return

  switch (event.action) {
    case 'unauthorized':
      return unauthorizedSequence()
    case 'registered':
      return lc.timed({range: LEDS.doorLeds, color: lc.COLORS.orange, type: 'pulse'}, 1000)
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
      return pulseUp(LEDS.doorLeds, lc.COLORS.orange)
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
      return pulseUp(LEDS.validatorLeds, lc.COLORS.amazonite)
    case 'billValidatorAccepting':
      return pulseUp(LEDS.validatorLeds, lc.COLORS.orange)
    case 'billValidatorRejecting':
      return pulseUp(LEDS.validatorLeds, lc.COLORS.red)

    case 'billDispenserDispensing':
      return solidUp(LEDS.dispenserLeds, lc.COLORS.amazonite)
    case 'billDispenserDispensed':
      return pulseUp(LEDS.dispenserLeds, lc.COLORS.orange)

    case 'scanBayLightOn':
      return solidUp(LEDS.scanBayLeds, lc.COLORS.dimmed)

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
      return pulseUp(LEDS.dispenserLeds, lc.COLORS.orange)
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
