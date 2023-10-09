// Run this after creating the device_config.json file for the Aveiro machines. Only run this on Aveiro machines!

const fs = require('fs')
const path = require('path')
const deviceConfig = require('../device_config.json')

if (process.argv.length !== 3) {
  console.log('Usage: node bin/set-machine-recyclers.js <number of recyclers>')
  console.log('Ex: node bin/set-machine-recyclers.js 3')
  process.exit(2)
}

if (process.argv[2] > 6 || process.argv[2] < 0) {
  console.log('<number of recyclers> must be between 0 and 6!')
  process.exit(2)
}

deviceConfig.billDispenser.recyclers = process.argv[2]

fs.writeFileSync(path.join(process.cwd(), 'device_config.json'), JSON.stringify(deviceConfig, null, 2))
