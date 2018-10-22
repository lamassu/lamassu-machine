const actionEmitter = require('../action-emitter')

let isDoorSecured = null

processDoor.isDoorSecured = () => isDoorSecured

function processDoor (event) {
  switch (event.action) {
    case 'doorSecured':
      isDoorSecured = true
      break
    case 'doorNotSecured':
      isDoorSecured = false
      break
  }
}

actionEmitter.on('door', processDoor)
