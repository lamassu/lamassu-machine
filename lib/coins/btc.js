const bs58check = require('bs58check')
const bech32 = require('bech32')
const _ = require('lodash/fp')

module.exports = {depositUrl, parseUrl, formatAddress}

function parseUrl (network, url) {
  const res = /^([bB]itcoin:\/{0,2})?(\w+)/.exec(url)
  const address = res && res[2]

  console.log('DEBUG16: [%s] *%s*', network, address)

  if (!validate(network, address)) return null

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

function base58Validator (network, address) {
  try {
    const buf = bs58check.decode(address)
    const addressType = buf[0]

    if (buf.length !== 21) {
      console.log(`Invalid base58 address length: ${buf.length}`)
      return false
    }

    if (network === 'main' && _.includes(addressType, [0x00, 0x05])) return true
    if (network === 'test' && _.includes(addressType, [0x6f, 0xc4])) return true

  } catch (error) {
    console.log('Failed to decode base58 Bitcoin address')
    return false
  }
}

function bech32Validator (network, address) {
  let decoded
  try {
    decoded = bech32.decode(address)
  } catch (error) {
    console.log('Failed to decode bech32 Bitcoin address')
    return false
  }

  const witnessVersion = decoded.words[0]
  if (witnessVersion < 0 || witnessVersion > 16) {
    console.log('Wrong witness version for bech32')
    return false
  }

  const data = bech32.fromWords(decoded.words.slice(1))
  if (data.length !== 20 && data.length !== 32) {
    console.log(`Invalid bech32 address length: ${data.length}`)
    return false
  }

  if (network === 'main' && decoded.prefix === 'bc') return true
  if (network === 'test' && decoded.prefix === 'tb') return true
}

function validate (network, address) {
  if (!network) throw new Error('No network supplied.')
  if (!address) throw new Error('No address supplied.')
  if (base58Validator(network, address)) return true
  if (bech32Validator(network, address)) return true
  return false
}
