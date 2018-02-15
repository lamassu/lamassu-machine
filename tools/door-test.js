const process = require('process')

const actionEmitter = require('../lib/action-emitter')

const doorManager = require('../lib/ssuboard/door-manager')
const ledManager = require('../lib/ssuboard/led-manager')
const u2f = require('../lib/ssuboard/u2f')
const io = require('../lib/ssuboard/io')

doorManager.run()
.then(ledManager.run)
.then(u2f.run)
.then(io.run)
.then(() => console.log('All set up.'))

actionEmitter.on('fob', r => console.log('DEBUG101: %j', r))

actionEmitter.on('doorManager', r => {
  console.log('DEBUG100')
  console.log(r)

  if (r.action === 'popDoor') {
    console.log('*** Door popped ***')
    // setTimeout(() => actionEmitter.emit('door', {action: 'doorNotSecured'}), 500)
    // setTimeout(() => actionEmitter.emit('door', {action: 'doorSecured'}), 2000)
  }
})

process.on('unhandledRejection', e => console.log(e.trace))
