const _ = require('lodash/fp')
const bs58check = require('bs58check')
const { bech32, bech32m } = require('bech32')

module.exports = { base58Validator, bech32mValidator, bech32Validator, isBech32Address, zecBech32Validator }

function validatePrefix (prefix, buf) {
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

function bech32mValidator (network, address, opts) {
  let decoded
  try {
    decoded = bech32m.decode(address)
  } catch (error) {
    console.log('Failed to decode bech32m address')
    return false
  }

  const witnessVersion = decoded.words[0]
  if (witnessVersion < 1 || witnessVersion > 16) {
    console.log('Unsupported witness version for bech32m')
    return false
  }

  const data = bech32m.fromWords(decoded.words.slice(1))
  if (data.length < 2 || data.length > 40) {
    console.log(`Invalid bech32m address length: ${data.length}`)
    return false
  }

  if (network === 'main' && decoded.prefix === opts.mainNetPrefix) return true
  if (network === 'test' && decoded.prefix === opts.testNetPrefix) return true
  return false
}


function isBech32Address (address, opts) {
  return bech32Validator('main', address, opts) || bech32Validator('test', address, opts)
}

function zecBech32Validator (network, address, opts) {
  let decoded
  try {
    decoded = bech32.decode(address)
  } catch (error) {
    console.log('Failed to decode bech32 address')
    return false
  }

  const data = bech32.fromWords(decoded.words)	
  if (data.length !== 43) {	
    console.log(`Invalid bech32 address length: ${data.length}`)	
    return false	
  }

  if (network === 'main' && decoded.prefix === opts.mainNetPrefix) return true
  if (network === 'test' && decoded.prefix === opts.testNetPrefix) return true
  return false
}

