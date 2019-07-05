const actionEmitter = require('../action-emitter')

const lc = require('./led-control')
const LEDS = require('./led-addresses')

module.exports = { run }

function pulseUp (range, color) {
  return lc.lightUp({ range, color, type: 'pulse' })
}

function solidUp (range, color) {
  return lc.lightUp({ range, color, type: 'solid' })
}

function processBrain (event) {
  switch (event.action) {
    case 'billValidatorPending':
      return pulseUp(LEDS.validatorLeds, lc.COLORS.amazonite)
    case 'billValidatorAccepting':
      return pulseUp(LEDS.validatorLeds, lc.COLORS.orange)
    case 'billValidatorRejecting':
      return pulseUp(LEDS.validatorLeds, lc.COLORS.red)

    case 'scanBayLightOn':
      return solidUp(LEDS.scanBayLeds, lc.COLORS.white)

    case 'billValidatorOff':
    case 'scanBayLightOff':
    case 'ledsOff':
    case 'forceOff':
      return lc.lightDown()
  }
}

function run () {
  console.log('DEBUG100')
  actionEmitter.on('brain', processBrain)
  return Promise.resolve()
}
