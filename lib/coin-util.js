function depositUrl (address, cryptoCode, amountStr) {
  try {
    switch (cryptoCode) {
      case 'BTC': return 'bitcoin:' + address + '?amount=' + amountStr
      case 'ETH': return 'ethereum:' + address + '?amount=' + amountStr
    }
  } catch (_) {
    return "<fake address: don't send>"
  }
}

module.exports = {depositUrl}
