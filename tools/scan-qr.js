const _ = require('lodash/fp')
const scanner = require('../lib/scanner')

const config = require('../device_config.json')
const licenses = require('../licenses.json')

_config = _.merge(config, licenses)
scanner.config(_config.scanner)

scanner.scanMainQR('BTC', (err, address) => {
  if (err) throw err

  console.log(address)
})
