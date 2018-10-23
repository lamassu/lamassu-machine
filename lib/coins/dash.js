const _ = require('lodash/fp')
const base58Validator = require('./validators').base58Validator

const base58Opts = {
  bufferLength: 21,
  mainNetPrefix: [ [0x4c], [0x10] ],
  testNetPrefix: [ [0x8c], [0x13] ]
}

module.exports = {depositUrl, parseUrl, base58Opts}

function parseUrl (network, url) {
  const res = /^(dash:\/{0,2})?(\w+)/.exec(url)
  const address = res && res[2]

  console.log('DEBUG16: *%s*', address)
  if (!validate(network, address)) return null

  return address
}

function depositUrl (address, amount) {
  return `dash:${address}?amount=${amount}`
}

function validate (network, address) {
  if (!network) throw new Error('No network supplied.')
  if (!address) throw new Error('No address supplied.')
  if (base58Validator(network, address, base58Opts)) return true
  return false
}
