var ICAP = require('ethereumjs-icap')

function cryptoUrl (cryptoCode, address, amount) {
  switch (cryptoCode) {
    case 'BTC': return 'bitcoin:' + address + '?amount=' + amount
    case 'ETH': return 'iban:' + ICAP.fromAddress(address, false, true) + '?amount=' + amount
  }
}

global.cryptoUrl = cryptoUrl
