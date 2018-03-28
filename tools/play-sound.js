const soundManager = require('../lib/ssuboard/sound-manager')
const actionEmitter = require('../lib/action-emitter')

function play () {
  actionEmitter.emit('brain', {action: 'playSound'})
}

soundManager.run()
  .then(() => {
    setInterval(play, 1000)
    setTimeout(() => process.exit(0), 6000)
  })

