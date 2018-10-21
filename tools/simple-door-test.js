const process = require('process')

const delay = require('delay')

const actionEmitter = require('../lib/action-emitter')

const doorManager = require('../lib/ssuboard/door-manager')
const ledManager = require('../lib/ssuboard/led-manager')
const io = require('../lib/ssuboard/io')

doorManager.run()
  .then(ledManager.run)
  .then(io.run)
  .then(() => console.log('All set up.'))
  .then(() => delay(1000))
  .then(() => console.log('Door open!'))
  .then(() => actionEmitter.emit('fob', {action: 'authorized'}))
  .then(() => delay(10000))

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
