const actionEmitter = require('../action-emitter')

let _isDoorSecured = null

const isDoorSecured = () => _isDoorSecured

module.exports = {isDoorSecured}

function processDoor (event) {
  switch (event.action) {
    case 'doorSecured':
      _isDoorSecured = true
      break
      case 'doorNotSecured':
      _isDoorSecured = false
      break
  }
}

actionEmitter.on('door', processDoor)
