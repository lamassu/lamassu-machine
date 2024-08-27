const { setTimeout: delay } = require('node:timers/promises')
const ledManager = require('../lib/leds/led-manager')
const actionEmitter = require('../lib/action-emitter')

const machine = process.argv[2]

function emit (subsystem, action) {
  return () => actionEmitter.emit(subsystem, {action})
}

ledManager.run(machine)
  .then(emit('brain', 'billValidatorPending'))
  .then(() => delay(3000))
  .then(emit('brain', 'billValidatorAccepting'))
  .then(() => delay(3000))
  .then(emit('brain', 'ledsOff'))
  .then(() => delay(3000))
  .then(emit('brain', 'scanBayLightOn'))
  .then(() => delay(3000))
  .then(emit('brain', 'ledsOff'))
  .then(() => delay(3000))
  .then(emit('door', 'doorNotSecured'))
  .then(() => delay(3000))
  .then(emit('door', 'doorSecured'))

