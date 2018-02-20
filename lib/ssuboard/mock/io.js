const actionEmitter = require('../action-emitter')

module.exports = {setup, run}

function setup () {
  return Promise.resolve()
}

function openDoor () {
  console.log('[MOCK] Opening door...')
  return Promise.resolve()
}

function processDoorManager (event) {
  switch (event.action) {
    case 'popDoor':
      return openDoor()
  }
}

function processSirenManager (event) {
  switch (event.action) {
    case 'sirenOn':
      return console.log('[MOCK] Siren on')
    case 'sirenOff':
      return console.log('[MOCK] Siren off')
  }
}

function initListeners () {
  actionEmitter.on('doorManager', processDoorManager)
  actionEmitter.on('sirenManager', processSirenManager)
}

function run () {
  return setup()
  .then(initListeners)
}
