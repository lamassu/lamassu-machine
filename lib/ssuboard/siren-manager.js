const actionEmitter = require('../action-emitter')

module.exports = {sirenOn, sirenOff}

function sirenOn () {
  actionEmitter.emit('sirenManager', {action: 'sirenOn'})
}

function sirenOff () {
  actionEmitter.emit('sirenManager', {action: 'sirenOff'})
}
