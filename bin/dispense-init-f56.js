const f56 = require('../lib/f56/f56-rs232')

if (process.argv.length !== 5) {
  console.log('Usage: node bin/dispense-init-f56.js <serial device> <top denomination> <bottom denomination>')
  console.log('Ex: node bin/dispense-init-f56.js /dev/ttyUSB0 5 20')
  process.exit(2)
}

f56.create(process.argv[2])
.then(() => f56.initialize('EUR', process.argv[3], process.argv[4]))
.then(res => console.dir(res))
.then(() => process.exit(0))
.catch(e => {
  console.log('DEBUG1')
  console.log(e)
  process.exit(1)
})
