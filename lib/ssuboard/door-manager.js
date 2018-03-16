const actionEmitter = require('../action-emitter')

module.exports = {run}

function delay (period) {
  return new Promise(resolve => setTimeout(resolve, period))
}

function doorPopSequence () {
  actionEmitter.emit('doorManager', {action: 'doorSequenceOn'})

  return delay(3000)
    .then(() => {
      actionEmitter.emit('doorManager', {action: 'doorSequenceOff'})
      actionEmitter.emit('doorManager', {action: 'popDoor'})
    })
}

function processFob (event) {
  if (!actionEmitter.isDoorSecured()) return

  switch (event.action) {
    case 'authorized':
      return doorPopSequence()
  }
}

function run () {
  console.log('DEBUG100')
  actionEmitter.on('fob', processFob)

  return Promise.resolve()
}
