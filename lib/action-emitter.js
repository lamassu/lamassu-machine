const EventEmitter = require('events')

const emitter = new EventEmitter()

let isDoorSecured = null

emitter.isDoorSecured = () => isDoorSecured

module.exports = emitter

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

emitter.on('door', processDoor)
