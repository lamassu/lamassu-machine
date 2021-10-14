const delay = require('delay')

const actionEmitter = require('../lib/action-emitter')

const ledManager = process.argv[2] === 'gaia' ?
  require('../lib/upboard/gaia/led-manager')
  :
  require('../lib/ssuboard/led-manager')

const ledAddresses = process.argv[2] === 'tejo'
  ? require('../lib/upboard/tejo/led-addresses')
  : null

function emit (subsystem, action) {
  return () => actionEmitter.emit(subsystem, {action})
}

ledManager.run(ledAddresses)
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

