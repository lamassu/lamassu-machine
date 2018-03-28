const actionEmitter = require('../lib/action-emitter')
const fobManager = require('../lib/ssuboard/fob-manager')

actionEmitter.on('fob', console.log)
actionEmitter.on('nfc', console.log)
fobManager.run()
.then(() => {
  console.log('DEBUG100')
})

// setTimeout(() => {}, 60000)
