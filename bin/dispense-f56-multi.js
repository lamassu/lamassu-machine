const f56 = require('./multi-cassette/f56-rs232-multi')
const deviceConfig = require('../device-config.json')

console.log(deviceConfig)

if (process.argv.length !== 5) {
  console.log('Usage: node bin/dispense-f56.js <serial device> <dispense 1> <dispense 2> <dispense 3> <dispense 4>')
  console.log('Ex: node bin/dispense-f56.js /dev/ttyUSB0 10 10 10 0')
  process.exit(2)
}

f56.create(process.argv[2])
.then(() => f56.billCount([process.argv[3], process.argv[4], process.argv[5], process.argv[6]]))
.then(res => console.dir(res))
.then(() => process.exit(0))
.catch(e => {
  console.log(e)
  process.exit(1)
})
