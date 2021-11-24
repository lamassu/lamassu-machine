// Run this after creating the device_config.json file for the Tejo machines. Only run this on Tejo machines!

const fs = require('fs')
const path = require('path')
const deviceConfig = require('../device_config.json')

if (deviceConfig.cryptomatModel !== 'tejo') {
  console.log('This script can only be run on setup Tejo devices')
  process.exit(2)
}

if (process.argv.length !== 3) {
  console.log('Usage: node bin/set-tejo-cassettes.js <number of cassettes>')
  console.log('Ex: node bin/set-tejo-cassettes.js 3')
  process.exit(2)
}

if (process.argv[2] > 4 || process.argv[2] < 2) {
  console.log('<number of cassettes> must be between 2 and 4!')
  process.exit(2)
}

deviceConfig.billDispenser.cassettes = process.argv[2]

fs.writeFileSync(path.join(process.cwd(), 'device_config.json'), JSON.stringify(deviceConfig, null, 2))
