const io = require('../lib/ssuboard/io')

io.setupOutputs()
.then(() => io.openDoor())
