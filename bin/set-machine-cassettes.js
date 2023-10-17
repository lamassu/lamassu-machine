// Run this after creating the device_config.json file for the Tejo and Aveiro machines. Only run this on Tejo and Aveiro machines!

const fs = require('fs')
const path = require('path')
const deviceConfig = require('../device_config.json')

if (deviceConfig.cryptomatModel !== 'tejo' || deviceConfig.cryptomatModel !== 'aveiro') {
  console.log('This script can only be run on setup Tejo and Aveiro devices')
  process.exit(2)
}

if (process.argv.length !== 3) {
  console.log('Usage: node bin/set-machine-cassettes.js <number of cassettes>')
  console.log('Ex: node bin/set-machine-cassettes.js 3')
  process.exit(2)
}

if (deviceConfig.cryptomatModel === 'tejo' && (process.argv[2] > 4 || process.argv[2] < 2)) {
  console.log('<number of cassettes> must be between 2 and 4 on Tejo devices!')
  process.exit(2)
}

if (deviceConfig.cryptomatModel === 'aveiro' && (process.argv[2] > 2 || process.argv[2] < 0)) {
  console.log('<number of cassettes> must be between 0 and 2 on Aveiro devices!')
  process.exit(2)
}

deviceConfig.billDispenser.cassettes = process.argv[2]

fs.writeFileSync(path.join(process.cwd(), 'device_config.json'), JSON.stringify(deviceConfig, null, 2))
