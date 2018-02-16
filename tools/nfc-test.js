const process = require('process')

const actionEmitter = require('../lib/action-emitter')

const u2f = require('../lib/ssuboard/u2f')

const nfc = require('../lib/ssuboard/nfc')

const _ = require('lodash/fp')

// u2f.run()
// .then(() => console.log('All set up.'))

// actionEmitter.on('fob', console.log)

actionEmitter.on('nfc', console.log)

function delay () {
  return new Promise(resolve => setTimeout(resolve, 1000))
}

nfc.run()
.catch(console.log)

process.on('unhandledRejection', e => console.log(e.trace))
