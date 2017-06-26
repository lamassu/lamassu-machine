module.exports = {depositUrl, parseUrl}

function parseUrl (network, url) {
  const res = /^(litecoin:\/{0,2})?(\w+)/.exec(url)
  const address = res && res[2]

  if (!address) return null

  console.log('DEBUG16: *%s*', address)

  return address
}

function depositUrl (address, amount) {
  return `litecoin:${address}?amount=${amount}`
}
