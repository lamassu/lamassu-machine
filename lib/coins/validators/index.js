const _ = require('lodash/fp')
const bs58check = require('bs58check')

module.exports = {base58Validator}

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
