const bs58check = require('bs58check')
const _ = require('lodash/fp')

const MAIN_PREFIXES = [0x1cb8, 0x1cbd]
const TEST_PREFIXES = [0x1d25, 0x1cba]

module.exports = {depositUrl, parseUrl}

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
  try {
    if (!network) throw new Error('No network supplied.')
    if (!address) throw new Error('No address supplied.')

    const buf = bs58check.decode(address)
    const addressType = buf.readUInt16BE()

    if (buf.length !== 22) throw new Error(`Invalid length: ${buf.length}`)

    console.log('DEBUG204: %j', addressType)
    if (network === 'main' && _.includes(addressType, MAIN_PREFIXES)) return true
    if (network === 'test' && _.includes(addressType, TEST_PREFIXES)) return true

    throw new Error('General error')
  } catch (err) {
    console.log(err)
    console.log('Invalid address: [%s] %s', network, address)
    return false
  }
}
