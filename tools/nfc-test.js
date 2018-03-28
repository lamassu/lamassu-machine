const process = require('process')

const actionEmitter = require('../lib/action-emitter')

const nfc = require('../lib/ssuboard/nfc')

const _ = require('lodash/fp')

// u2f.run()
// .then(() => console.log('All set up.'))

// actionEmitter.on('fob', console.log)

actionEmitter.on('nfc', console.log)

function delay () {
  return new Promise(resolve => setTimeout(resolve, 1000))
}

nfc.run('ACS ACR1281 1S PICC Reader(1)')
.catch(console.log)

process.on('unhandledRejection', e => console.log(e.trace))
