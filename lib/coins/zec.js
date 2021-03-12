const _ = require('lodash/fp')
const base58Validator = require('./validators').base58Validator
const zecBech32Validator = require('./validators').zecBech32Validator

const base58Opts = {
  bufferLength: 22,
  mainNetPrefix: [
    [0x1C, 0xB8], // t1
    [0x1C, 0xBD]  // t3
  ],
  testNetPrefix: [
    [0x1C, 0xBA], // t2
    [0x1D, 0x25]  // tm
  ]
}

const bech32Opts = {
  mainNetPrefix: 'zs',
  testNetPrefix: 'ztestsapling'
}

module.exports = {depositUrl, parseUrl, base58Opts, bech32Opts}

function parseUrl (network, url) {
  const res = /^(zcash:\/{0,2})?(\w+)/.exec(url)
  const address = res && res[2]

  console.log('DEBUG16: *%s*', address)
  if (!validate(network, address)) throw new Error('Invalid address')

  return address
}

function depositUrl (address, amount) {
  return `zcash:${address}?amount=${amount}`
}

function validate (network, address) {
  if (!network) throw new Error('No network supplied.')
  if (!address) throw new Error('No address supplied.')
  if (base58Validator(network, address, base58Opts)) return true
  if (zecBech32Validator(network, address, bech32Opts)) return true
  return false
}
