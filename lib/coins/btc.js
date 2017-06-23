const bitcoinAddressValidator = require('bitcoin-address')

module.exports = {depositUrl, parseUrl}

function parseUrl (network, url) {
  const res = /^(bitcoin:\/{0,2})?(\w+)/.exec(url)
  const address = res && res[2]

  if (!address) return null

  console.log('DEBUG16: *%s*', address)

  if (!bitcoinAddressValidator.validate(address, network)) {
    console.log('Invalid bitcoin address: %s', address)
    return null
  }

  return address
}

function depositUrl (address, amount) {
  return `bitcoin:${address}?amount=${amount}`
}
