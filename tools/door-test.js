const process = require('process')

const actionEmitter = require('../lib/action-emitter')

const doorManager = require('../lib/ssuboard/door-manager')
const u2f = require('../lib/ssuboard/u2f')

u2f.run()
.then(doorManager.run)
.then(() => console.log('All set up.'))

actionEmitter.on('fob', console.log)

actionEmitter.on('doorManager', r => {
  console.log(r)

  if (r.action === 'popDoor') {
    console.log('*** Door popped ***')
    setTimeout(() => actionEmitter.emit('door', {action: 'doorNotSecured'}), 500)
    setTimeout(() => actionEmitter.emit('door', {action: 'doorSecured'}), 2000)
  }
})

process.on('unhandledRejection', e => console.log(e.trace))
