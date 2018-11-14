const _ = require('lodash/fp')
const bech32 = require('bech32')
const base58Validator = require('./validators').base58Validator

const base58Opts = {
  bufferLength: 21,
  mainNetPrefix: [ [0x00], [0x05] ],
  testNetPrefix: [ [0x6f], [0xc4] ]
}

module.exports = {depositUrl, parseUrl, formatAddress, base58Opts}

function parseUrl (network, url) {
  const res = /^([bB]itcoin:\/{0,2})?(\w+)/.exec(url)
  const address = res && res[2]

  console.log('DEBUG16: [%s] *%s*', network, address)

  if (!validate(network, address)) throw new Error('Invalid address')

  return address
}

function depositUrl (address, amount) {
  const parts = _.split(':', address)

  // Strike LN payment
  if (parts[0] === 'strike') return _.nth(3, parts)

  // Regular LN payment
  if (_.size(parts) === 2) return _.nth(1, parts)

  return `bitcoin:${address}?amount=${amount}`
}

function formatAddress (address) {
  const parts = _.split(':', address)
  const isLightning = _.size(parts) >= 2

  if (isLightning) return 'Lightning Network'
  return address
}

function bech32Validator (network, address) {
  let decoded
  try {
    decoded = bech32.decode(address)
  } catch (error) {
    console.log('Failed to decode bech32 address')
    return false
  }

  const witnessVersion = decoded.words[0]
  if (witnessVersion !== 0) {
    console.log('Unsupported witness version for bech32')
    return false
  }

  const data = bech32.fromWords(decoded.words.slice(1))	
  if (data.length !== 20 && data.length !== 32) {	
    console.log(`Invalid bech32 address length: ${data.length}`)	
    return false	
  }

  if (network === 'main' && decoded.prefix === 'bc') return true
  if (network === 'test' && decoded.prefix === 'tb') return true
  return false
}

function validate (network, address) {
  if (!network) throw new Error('No network supplied.')
  if (!address) throw new Error('No address supplied.')
  if (base58Validator(network, address, base58Opts)) return true
  if (bech32Validator(network, address)) return true
  return false
}
