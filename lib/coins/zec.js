const _ = require('lodash/fp')
const base58Validator = require('./validators').base58Validator

const base58Opts = {
  bufferLength: 22,
  mainNetPrefix: [
    [0x1C, 0xB8], // t1
    [0x1C, 0xBD]  // t3
  ],
  testNetPrefix: [
    [0x1C, 0xBA], // t2
    [0x1C, 0xD2]  // tm
  ]
}

module.exports = {depositUrl, parseUrl, base58Opts}

function parseUrl (network, url) {
  const res = /^(zcash:\/{0,2})?(\w+)/.exec(url)
  const address = res && res[2]

  console.log('DEBUG16: *%s*', address)
  if (!validate(network, address)) return null

  return address
}

function depositUrl (address, amount) {
  return `zcash:${address}?amount=${amount}`
}

function validate (network, address) {
  if (!network) throw new Error('No network supplied.')
  if (!address) throw new Error('No address supplied.')
  if (base58Validator(network, address, base58Opts)) return true
  return false
  // try {
  //   if (!network) throw new Error('No network supplied.')
  //   if (!address) throw new Error('No address supplied.')

  //   const buf = bs58check.decode(address)
  //   const addressType = buf.readUInt16BE()

  //   if (buf.length !== 22) throw new Error(`Invalid length: ${buf.length}`)

  //   if (network === 'main' && _.includes(addressType, MAIN_PREFIXES)) return true
  //   if (network === 'test' && _.includes(addressType, TEST_PREFIXES)) return true

  //   throw new Error('General error')
  // } catch (err) {
  //   console.log(err)
  //   console.log('Invalid address: [%s] %s', network, address)
  //   return false
  // }
}
