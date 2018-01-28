const bs58check = require('bs58check')
const _ = require('lodash/fp')

module.exports = {depositUrl, parseUrl, formatAddress}

function parseUrl (network, url) {
  const res = /^(bitcoin:\/{0,2})?(\w+)/.exec(url)
  const address = res && res[2]

  console.log('DEBUG16: [%s] *%s*', network, address)

  if (!validate(network, address)) return null

  return address
}

function depositUrl (address, amount) {
  const parts = _.split(':', address)

  const isLightning = _.size(parts) === 2

  if (isLightning) {
    const paymentRequest = _.nth(1, parts)
    return paymentRequest
  }

  return `bitcoin:${address}?amount=${amount}`
}

function formatAddress (address) {
  const parts = _.split(':', address)
  const isLightning = _.size(parts) === 2

  if (isLightning) return 'Lightning Network'
  return address
}

function validate (network, address) {
  try {
    if (!network) throw new Error('No network supplied.')
    if (!address) throw new Error('No address supplied.')

    const buf = bs58check.decode(address)
    const addressType = buf[0]

    if (buf.length !== 21) throw new Error(`Invalid length: ${buf.length}`)

    console.log('DEBUG204: %j, %d', addressType, buf.length)
    if (network === 'main' && _.includes(addressType, [0x00, 0x05])) return true
    if (network === 'test' && _.includes(addressType, [0x6f, 0xc4])) return true

    throw new Error('General error')
  } catch (err) {
    console.log(err)
    console.log('Invalid bitcoin address: [%s] %s', network, address)
    return false
  }
}
