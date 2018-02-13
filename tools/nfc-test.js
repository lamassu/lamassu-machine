const process = require('process')

const actionEmitter = require('../lib/action-emitter')

const u2f = require('../lib/ssuboard/u2f')

const nfc = require('../lib/ssuboard/nfc')

// u2f.run()
// .then(() => console.log('All set up.'))

// actionEmitter.on('fob', console.log)

actionEmitter.on('nfc', console.log)
nfc.run()


process.on('unhandledRejection', e => console.log(e.trace))
