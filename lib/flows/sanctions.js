
const actionEmitter = require('../action-emitter')

module.exports = {start}

function start () {
  actionEmitter.emit('action', 'sanctionsFailure')
}
