const delay = require('delay')

const actionEmitter = require('../lib/action-emitter')

const ledManager = process.argv[2] === 'gaia' ?
  require('../lib/upboard/gaia/led-manager')
  :
  require('../lib/ssuboard/led-manager')

function emit (subsystem, action) {
  return () => actionEmitter.emit(subsystem, {action})
}

ledManager.run()
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

