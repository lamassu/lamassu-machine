const process = require('process')

const actionEmitter = require('../lib/action-emitter')

const io = require('../lib/ssuboard/io')

process.on('unhandledRejection', console.log)

actionEmitter.on('door', console.log)
io.run()
.then(() => console.log('running.'))
