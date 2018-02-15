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
.then(delay)
.then(() => {
  return nfc.control(3500, Buffer.from([0xe0, 0x00, 0x00, 0x21, 0x01, 0x57]), 1000)
  .then(r => console.log('DEBUG100: %j', _.map(rr => rr.toString(16), r)))
})
.catch(console.log)

process.on('unhandledRejection', e => console.log(e.trace))
