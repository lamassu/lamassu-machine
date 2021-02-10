
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
  }
}

module.exports = { coins, depositUrl, parseUrl, formatAddress, formatAddressCasing, createWallet }

const plugins = {
  BTC: require('./btc'),
  ETH: require('./eth'),
  ZEC: require('./zec'),
  LTC: require('./ltc'),
  DASH: require('./dash'),
  BCH: require('./bch')
}

const isBech32Address = require('./validators').isBech32Address

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
  const address = plugin.parseUrl(network, url)
  return formatAddressCasing(cryptoCode, address)
}

function formatAddress (cryptoCode, address) {
  if (!address) return null

  const plugin = coinPlugin(cryptoCode)
  if (!plugin.formatAddress) return address
  return plugin.formatAddress(address)
}

function formatAddressCasing (cryptoCode, address) {
  const plugin = coinPlugin(cryptoCode)
  if (!plugin.bech32Opts) return address
  return isBech32Address(address, plugin.bech32Opts) ? address.toLowerCase() : address
}

function createWallet (cryptoCode) {
  const plugin = coinPlugin(cryptoCode)
  if (!plugin.createWallet) {
    throw new Error(`${cryptoCode} paper wallet printing is not supported`)
  }

  return plugin.createWallet()
}
