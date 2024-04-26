const cp = require('child_process')
const _ = require('lodash/fp')

const actionEmitter = require('../action-emitter')
const machineLeds = require('./machine-leds')

const lc = require('./led-control')

let ledAddresses

module.exports = { run }

function pulseUp (range, color) {
  return lc.lightUp({ range, color, type: 'pulse' })
}

function solidUp (range, color) {
  return lc.lightUp({ range, color, type: 'solid' })
}

function killAll () {
  console.log('LED: kill any hangovers')
  cp.execFile('/usr/bin/killall', ['leds'], () => {})
}

function processBrain (event) {
  switch (event.action) {
    case 'billValidatorPending':
      return pulseUp(ledAddresses.validatorLeds, lc.COLORS.amazonite)
    case 'billValidatorAccepting':
      return pulseUp(ledAddresses.validatorLeds, lc.COLORS.orange)
    case 'billValidatorRejecting':
      return pulseUp(ledAddresses.validatorLeds, lc.COLORS.red)

    case 'billDispenserDispensing':
      return solidUp(ledAddresses.dispenserLeds, lc.COLORS.amazonite)
    case 'billDispenserDispensed':
      return pulseUp(ledAddresses.dispenserLeds, lc.COLORS.orange)

    case 'scanBayLightOn':
      return solidUp(ledAddresses.scanBayLeds, lc.COLORS.dimmed)

    case 'billValidatorOff':
    case 'billDispenserCollected':
    case 'scanBayLightOff':
    case 'ledsOff':
    case 'forceOff':
      return lc.lightDown()
  }
}

function run (machine) {
  console.log('DEBUG100')
  ledAddresses = machineLeds[machine]
  if (ledAddresses) {
    killAll()
    actionEmitter.on('brain', processBrain)
  }
}
