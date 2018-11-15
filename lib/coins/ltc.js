const _ = require('lodash/fp')
const base58Validator = require('./validators').base58Validator
const bech32Validator = require('./validators').bech32Validator

const base58Opts = {
  bufferLength: 21,
  mainNetPrefix: [ [0x30], [0x32] ],
  testNetPrefix: [ [0x6f], [0x3a] ]
}

const bech32Opts = {
  mainNetPrefix: 'ltc',
  testNetPrefix: 'tltc'
}

module.exports = {depositUrl, parseUrl, base58Opts, bech32Opts}

function parseUrl (network, url) {
  const res = /^(litecoin:\/{0,2})?(\w+)/.exec(url)
  const address = res && res[2]

  console.log('DEBUG16: *%s*', address)
  if (!validate(network, address)) throw new Error('Invalid address')

  return address
}

function depositUrl (address, amount) {
  return `litecoin:${address}?amount=${amount}`
}

function validate (network, address) {
  if (!network) throw new Error('No network supplied.')
  if (!address) throw new Error('No address supplied.')
  if (base58Validator(network, address, base58Opts)) return true
  if (bech32Validator(network, address, bech32Opts)) return true
  return false
}
