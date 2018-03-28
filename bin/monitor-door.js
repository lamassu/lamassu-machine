const io = require('../lib/ssuboard/io')

io.setupInputs()
.then(() => setInterval(() => {
  io.doorStatus().then(console.log)
}, 500))
