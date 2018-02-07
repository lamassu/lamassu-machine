const actionEmitter = require('../lib/action-emitter')

const doorManager = require('../lib/ssuboard/door-manager')

doorManager.run()

actionEmitter.on('doorManager', console.log)

console.log('opening door...')
actionEmitter.emit('fob', {action: 'authorized'})
setTimeout(() => actionEmitter.emit('door', {action: 'doorNotSecured'}), 3500)

setTimeout(() => {
  console.log('closing door')
  actionEmitter.emit('door', {action: 'doorSecured'})
}, 15000)

// Todo: conflicts are causing errors
// instead of complaining on conflicts, ledControl should kill previous stuff and start anew
