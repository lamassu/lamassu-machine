const _ = require('lodash/fp')
const bs58check = require('bs58check')
const bech32 = require('bech32')

module.exports = {base58Validator, bech32Validator}

function validatePrefix(prefix, buf) {
  for (let prefixIndex = 0; prefixIndex < prefix.length; prefixIndex++) {
    let currentPrefix = prefix[prefixIndex]
    for (let byteIndex = 0; byteIndex < currentPrefix.length; byteIndex++) {
      if (currentPrefix[byteIndex] !== buf[byteIndex]) break
      if (byteIndex === currentPrefix.length - 1) return true
    }
  }
  return false
}

function base58Validator (network, address, opts) {
  try {
    const buf = bs58check.decode(address)

    if (buf.length !== opts.bufferLength) {
      console.log(`Invalid base58 address length: ${buf.length}`)
      return false
    }

    if (network === 'main' && validatePrefix(opts.mainNetPrefix, buf)) return true
    if (network === 'test' && validatePrefix(opts.testNetPrefix, buf)) return true
    console.log('Unrecognized network')
    return false

  } catch (error) {
    console.log('Failed to decode base58 address:', error.message)
    return false
  }
}

function bech32Validator (network, address, opts) {
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

  if (network === 'main' && decoded.prefix === opts.mainNetPrefix) return true
  if (network === 'test' && decoded.prefix === opts.testNetPrefix) return true
  return false
}
