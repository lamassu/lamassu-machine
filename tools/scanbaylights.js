const actionEmitter = require('../lib/action-emitter')

const ledManager = require('../lib/upboard/sintra/led-manager')

function lightOn () {
  actionEmitter.emit('brain', {action: 'scanBayLightOn'})
}

function lightOff () {
  console.log('DEBUG500')
  actionEmitter.emit('brain', {action: 'forceOff'})
}

console.log(process.argv[2])
ledManager.run()
  .then(() => {
    if (process.argv[2] === 'off') {
      lightOff()
    } else {
      lightOn()
    }
  })

setTimeout(() => {}, 2000)

process.on('unhandledRejection', console.log)
