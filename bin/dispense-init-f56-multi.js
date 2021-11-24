const f56 = require('./multi-cassette/f56-rs232-multi')
const deviceConfig = require('../device_config.json')

if (deviceConfig.cryptomatModel !== 'tejo') {
  console.log('This script can only be run on setup Tejo devices')
  process.exit(2)
}

if (!deviceConfig.billDispenser.cassettes) {
  console.log('Number of cassettes is not defined in device_config.json. If you\'re running this on a Tejo machine, consider running \"node bin/set-tejo-cassettes.js <number of cassettes>\"')
  process.exit(2)
}

if (process.argv.length < 5) {
  console.log('Usage: node bin/dispense-init-f56-multi.js <serial device> <denomination 1> <denomination 2> [<denomination 3> <denomination 4>]')
  console.log('Ex: node bin/dispense-init-f56-multi.js /dev/ttyUSB0 5 10')
  console.log('Ex: node bin/dispense-init-f56-multi.js /dev/ttyUSB0 5 10 20')
  console.log('Ex: node bin/dispense-init-f56-multi.js /dev/ttyUSB0 5 10 20 50')

  process.exit(2)
}

if (process.argv.length !== 3 + parseInt(deviceConfig.billDispenser.cassettes)) {
  console.log('Number of arguments related to cassette bills do not match the amount of cassettes on the device config!')
  process.exit(2)
}

const denominations = []

for (let i = 3; i < 3 + parseInt(deviceConfig.billDispenser.cassettes); i++) {
  denominations.push(process.argv[i])
}

f56.create(process.argv[2])
  .then(() => f56.initialize('EUR', denominations))
  .then(res => console.dir(res))
  .then(() => process.exit(0))
  .catch(e => {
    console.log('DEBUG1')
    console.log(e)
    process.exit(1)
  })
