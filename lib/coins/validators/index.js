const _ = require('lodash/fp')
const bs58check = require('bs58check')
const bech32 = require('bech32')

module.exports = {base58Validator, bech32Validator}

function base58Validator (network, address, opts) {
  try {
    const buf = bs58check.decode(address)

    function validatePrefix(prefix) {
      let found = false
      for (let i = 0; i < prefix.length; i++) {
        if (found) break
        for (let j = 0; j < prefix[i].length; j++) {
          found = (prefix[i][j] !== buf[j]) ? false : true
        }
      }
      return found;
    }

    if (buf.length !== opts.bufferLength) {
      console.log(`Invalid base58 address length: ${buf.length}`)
      return false
    }

    if (network === 'main' && validatePrefix(opts.mainNetPrefix)) return true
    if (network === 'test' && validatePrefix(opts.testNetPrefix)) return true
    throw new Error('General error')

  } catch (error) {
    console.log('Failed to decode base58 address')
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
  if (witnessVersion === 0) {
    const data = bech32.fromWords(decoded.words.slice(1))
    if (data.length !== 20 && data.length !== 32) {
      console.log(`Invalid bech32 address length: ${data.length}`)
      return false
    }
  } else {
    console.log('Unsupported witness version for bech32')
    return false
  }


  if (network === 'main' && decoded.prefix === opts.mainNetPrefix) return true
  if (network === 'test' && decoded.prefix === opts.testNetPrefix) return true
}
