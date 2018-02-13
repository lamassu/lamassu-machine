const actionEmitter = require('../lib/action-emitter')
const u2f = require('../lib/ssuboard/u2f')

actionEmitter.on('fob', console.log)

u2f.run()
.then(() => {
  console.log('DEBUG100')
})
