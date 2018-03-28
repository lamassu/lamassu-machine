const sirenManager = require('../lib/ssuboard/siren-manager')
const io = require('../lib/ssuboard/io')

const delay = period => () => new Promise(resolve => setTimeout(resolve, period))

const actionEmitter = require('../lib/action-emitter')
actionEmitter.on('sirenManager', console.log)

process.on('unhandledRejection', console.log)

console.log('starting')

io.run()
.then(delay(2000))
.then(sirenManager.sirenOn)
.then(() => console.log('siren on'))
.then(delay(500))
.then(sirenManager.sirenOff)
.then(() => console.log('siren off'))

