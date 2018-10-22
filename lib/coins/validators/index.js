const _ = require('lodash/fp')
const bs58check = require('bs58check')
const bech32 = require('bech32')

module.exports = {base58Validator, bech32Validator}

function base58Validator (network, address, opts) {
  try {
    const buf = bs58check.decode(address)
    const addressType = buf[0]

    if (buf.length !== opts.bufferLength) {
      console.log(`Invalid base58 address length: ${buf.length}`)
      return false
    }

    if (network === 'main' && _.includes(addressType, opts.mainNetPrefix)) return true
    if (network === 'test' && _.includes(addressType, opts.testNetPrefix)) return true

  } catch (error) {
    console.log('Failed to decode base58 Bitcoin address')
    return false
  }
}

function bech32Validator (network, address, opts) {
  let decoded
  try {
    decoded = bech32.decode(address)
  } catch (error) {
    console.log('Failed to decode bech32 Bitcoin address')
    return false
  }

  const witnessVersion = decoded.words[0]
  if (witnessVersion !== opts.witnessVersion) {
    console.log('Wrong witness version for bech32')
    return false
  }

  const data = bech32.fromWords(decoded.words.slice(1))
  if (data.length !== opts.minAddressLen && data.length !== opts.maxAddressLen) {
    console.log(`Invalid bech32 address length: ${data.length}`)
    return false
  }

  if (network === 'main' && decoded.prefix === opts.mainNetPrefix) return true
  if (network === 'test' && decoded.prefix === opts.testNetPrefix) return true
}
