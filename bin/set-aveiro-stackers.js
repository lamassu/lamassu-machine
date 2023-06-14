// Run this after creating the device_config.json file for the Aveiro machines. Only run this on Aveiro machines!

const fs = require('fs')
const path = require('path')
const deviceConfig = require('../device_config.json')

if (deviceConfig.cryptomatModel !== 'aveiro') {
  console.log('This script can only be run on setup Aveiro devices')
  process.exit(2)
}

if (process.argv.length !== 3) {
  console.log('Usage: node bin/set-aveiro-stackers.js <number of stackers>')
  console.log('Ex: node bin/set-aveiro-stackers.js 3')
  process.exit(2)
}

if (process.argv[2] > 3 || process.argv[2] < 0) {
  console.log('<number of stackers> must be between 0 and 3!')
  process.exit(2)
}

deviceConfig.billDispenser.stackers = process.argv[2]

fs.writeFileSync(path.join(process.cwd(), 'device_config.json'), JSON.stringify(deviceConfig, null, 2))
