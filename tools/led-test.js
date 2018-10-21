const delay = require('delay')

const actionEmitter = require('../lib/action-emitter')
const ledManager = require('../lib/ssuboard/led-manager')

function emit (subsystem, action) {
  return () => actionEmitter.emit(subsystem, {action})
}

ledManager.run()
  .then(emit('brain', 'billValidatorPending'))
  .then(() => delay(3000))
  .then(emit('brain', 'ledsOff'))
