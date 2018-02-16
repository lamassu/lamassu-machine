const actionEmitter = require('../action-emitter')

module.exports = {run}

function cardPresent (atr) {

}

function processNfc (event) {
  switch (event.action) {
    case 'cardPresent':
      return cardPresent(event.atr)
    case 'cardRemoved':
      return actionEmitter.emit('fob', {action: 'fobRemoved'})
  }
}

function run () {
  actionEmitter.on('nfc', processNfc)
}
