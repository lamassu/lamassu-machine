
const coins = {
  BTC: {
    displayScale: 5,
    unitScale: 8,
    zeroConf: true
  },
  ETH: {
    displayScale: 15,
    unitScale: 18,
    zeroConf: false
  },
  ZEC: {
    displayScale: 5,
    unitScale: 8,
    zeroConf: true
  },
  LTC: {
    displayScale: 5,
    unitScale: 8,
    zeroConf: true
  },
  DASH: {
    displayScale: 5,
    unitScale: 8,
    zeroConf: true
  },
  BCH: {
    displayScale: 5,
    unitScale: 8,
    zeroConf: true
  },
  ADA: {
    displayScale: 6,
    unitScale: 6,
    zeroConf: true
  }
}

module.exports = {coins, depositUrl, parseUrl, formatAddress, createWallet}

const plugins = {
  BTC: require('./btc'),
  ETH: require('./eth'),
  ZEC: require('./zec'),
  LTC: require('./ltc'),
  DASH: require('./dash'),
  BCH: require('./bch'),
  ADA: require('./ada')
}

function depositUrl (cryptoCode, address, amountStr) {
  if (!address) return null
  const plugin = coinPlugin(cryptoCode)
  return plugin.depositUrl(address, amountStr)
}

function coinPlugin (cryptoCode) {
  const plugin = plugins[cryptoCode]
  if (!plugin) throw new Error(`Unsupported coin: ${cryptoCode}`)
  return plugin
}

function parseUrl (cryptoCode, network, url) {
  const plugin = coinPlugin(cryptoCode)
  return plugin.parseUrl(network, url)
}

function formatAddress (cryptoCode, address) {
  if (!address) return null

  const plugin = coinPlugin(cryptoCode)
  if (!plugin.formatAddress) return address
  return plugin.formatAddress(address)
}

function createWallet (cryptoCode) {
  const plugin = coinPlugin(cryptoCode)
  if (!plugin.createWallet) {
    throw new Error(`${cryptoCode} paper wallet printing is not supported`)
  }

  return plugin.createWallet()
}
