const f56 = require('./multi-cassette/f56-rs232-multi')
const deviceConfig = require('../device-config.json')

if (process.argv.length !== 5) {
  console.log('Usage: node bin/dispense-init-f56.js <serial device> <denomination 1> <denomination 2> <denomination 3> <denomination 4>')
  console.log('Ex: node bin/dispense-init-f56.js /dev/ttyUSB0 5 10 20 50')
  process.exit(2)
}

f56.create(process.argv[2])
.then(() => f56.initialize('EUR', [process.argv[3], process.argv[4], process.argv[5], process.argv[6]]))
.then(res => console.dir(res))
.then(() => process.exit(0))
.catch(e => {
  console.log('DEBUG1')
  console.log(e)
  process.exit(1)
})
