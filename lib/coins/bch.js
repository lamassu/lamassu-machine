const cashaddr = require('cashaddrjs')
const _ = require('lodash/fp')

const NETWORK_PREFIX = {'main': 'bitcoincash:', 'test': 'bchtest:'}

module.exports = {depositUrl, parseUrl}

function parseUrl (network, url) {
  const res = /^(bitcoincash:\/{0,2}|bchtest:\/{0,2})?(\w+)/.exec(url.toLowerCase())
  const addressPayload = res && res[2]
  const address = NETWORK_PREFIX[network] + addressPayload

  console.log('DEBUG16: [%s] *%s*', network, addressPayload)

  if (!validate(address)) throw new Error('Invalid address')

  return address
}

function depositUrl (address, amount) {
  return `${address}?amount=${amount}`
}

function validate (address) {
  try {
    if (!address) throw new Error('No address supplied.')

    const buf = cashaddr.decode(address)
    // if either payload is invalid or payload and network don't match, cashaddrjs throws validationError
    return true
  } catch (err) {
    console.log(err)
    console.log('Invalid bitcoin cash address: %s', address)
    return false
  }
}
