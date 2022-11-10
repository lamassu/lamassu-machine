const actionEmitter = require('../../action-emitter')

module.exports = {start, getTrigger}

let trigger

function getTrigger () {
  return trigger
}

function setTrigger (_trigger) {
  trigger = _trigger
}

function start (model, trigger) {
  setTrigger(trigger)
  actionEmitter.emit('action', 'triggerExternal')
}
