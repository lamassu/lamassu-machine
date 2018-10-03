const actionEmitter = require('../action-emitter')
const util = require('util')

let isDoorSecured = null

actionEmitter.isDoorSecured = () => isDoorSecured

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