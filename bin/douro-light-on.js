const id003 = require('../lib/id003/id003')

const device = process.argv[2]
if (!device) {
  console.log('Usage: light <device path>')
  process.exit(1)
}

const bv = id003.factory({rs232: {device}})

bv.run(function () {
  bv.lightOn()
})
