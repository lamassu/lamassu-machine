const fs = require('fs')
const http = require('http')
const { URL } = require('url')
const cheerio = require('cheerio')
const net = require('net')

const DevTools = function (config) {
  this.config = config
  this.values = null
  this.mockBillValidatorClient = null
  this.webpage = null
  this.counter = 0
}

DevTools.prototype.disablePairing = function disablePairing () {
  this.webpage('#token-input').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#token-submit').attr('disabled', true).css('background-color', '#ffffff26')
}

DevTools.prototype.enablePairing = function enablePairing () {
  this.webpage('#token-input').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#token-submit').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
}

DevTools.prototype.disableAddressScan = function disableAddressScan () {
  this.webpage('#btc-address-input').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#btc-address-submit').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#eth-address-input').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#eth-address-submit').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#bch-address-input').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#bch-address-submit').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#usdt-address-input').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#usdt-address-submit').attr('disabled', true).css('background-color', '#ffffff26')
}

DevTools.prototype.enableAddressScan = function enableAddressScan () {
  this.webpage('#btc-address-input').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#btc-address-submit').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#eth-address-input').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#eth-address-submit').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#bch-address-input').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#bch-address-submit').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#usdt-address-input').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#usdt-address-submit').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
}

DevTools.prototype.disableBillInput = function disableBillInput () {
  this.webpage('#bill-10').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#bill-20').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#bill-50').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#bill-100').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#bill-200').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#custom-bill-input').attr('disabled', true).css('background-color', '#ffffff26')
  this.webpage('#custom-bill-submit').attr('disabled', true).css('background-color', '#ffffff26')
}

DevTools.prototype.enableBillInput = function enableBillInput () {
  this.webpage('#bill-10').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#bill-20').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#bill-50').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#bill-100').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#bill-200').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#custom-bill-input').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
  this.webpage('#custom-bill-submit').attr('disabled', false).css('background-color', '#fff').css('color', 'black')
}

DevTools.prototype.updatePage = function updatePage () {
  const { mockCam, mockBillValidator } = this.config
  this.webpage('#token-input').attr('value', this.values.pairingToken)
  this.webpage('#btc-address-input').attr('value', this.values.walletAddresses.BTC)
  this.webpage('#eth-address-input').attr('value', this.values.walletAddresses.ETH)
  this.webpage('#bch-address-input').attr('value', this.values.walletAddresses.BCH)
  this.webpage('#usdt-address-input').attr('value', this.values.walletAddresses.USDT)

  // if (isMachinePaired()) {
  //   this.disablePairing()
  // }

  // if (!mockCam) {
  //   this.disablePairing()
  //   this.disableAddressScan()
  // }

  if (!mockBillValidator) {
    // this.disableBillInput()
  } else {
    this.connectToBillValidatorMock()
  }
}

DevTools.prototype.connectToBillValidatorMock = function connectToBillValidatorMock () {
  const _connect = () => {
    if (this.mockBillValidatorClient && !this.mockBillValidatorClient.destroyed) return

    this.mockBillValidatorClient = net.connect({port: 3077}, () => {
      if (this.webpage) {
        // this.enableBillInput()
      }
      console.log('Dev Tools connected to id003 mock')
    })

    this.mockBillValidatorClient.on('end', () => {
      console.log('Dev Tools disconnected from id003 mock')
    })
  
    this.mockBillValidatorClient.on('error', _ => {
      // if (this.webpage) {
      //   this.disableBillInput()
      // }
    })
  }

  const connect = () => {
    try {
      _connect()
    } catch(_) {}
  }

  connect()
  setInterval(connect, 1000)
}

DevTools.prototype.getValues = function getValues () {
  return this.values
}

const isMachinePaired = function isMachinePaired () {
  return fs.existsSync('data/connection_info.json')
    && fs.existsSync('data/client.key')
    && fs.existsSync('data/client.pem')
}

DevTools.prototype.run = function run () {
  const { mockCam, mockBillValidator } = this.config
  if (!mockCam && !mockBillValidator) return

  this.values = {
    pairingToken: null,
    walletAddresses: this.config.brain.mockCryptoQR || {}
  }

  const uiToolsPage = fs.readFileSync('tools/ui-tools.html')

  if (!uiToolsPage) console.log('Error reading tools/ui-tools.html')

  this.webpage = cheerio.load(uiToolsPage)

  const httpRouter = (req, res) => {
    const safeParseInt = s => {
      try { return parseInt(s, 10)}
      catch (e) { return null }
    }
    
    const url = new URL(`http://${req.headers.host}${req.url}`)

    const notFound = () => {
      res.writeHead(404, {'Content-Type': 'text/html'})
      res.end('{"message": "Not Found"}')
    }

    if (url.pathname === '/') {
      // do nothing
    } else if (url.pathname === '/insertBill') {
      if (!mockBillValidator) return notFound()
      const denomination = safeParseInt(url.searchParams.get('value'))
      this.mockBillValidatorClient.write(JSON.stringify({command: 'insertBill', denomination}))
    } else if (url.pathname === '/pairingToken') {
      if (!mockCam) return notFound()
      const token = url.searchParams.get('value')
      this.values.pairingToken = token
    } else if (url.pathname === '/walletAddress') {
      if (!mockCam) return notFound()
      const coin = url.searchParams.get('coin')
      const address = url.searchParams.get('value')
      this.values.walletAddresses[coin.toUpperCase()] = address
    } else {
      return notFound()
    }

    this.updatePage()
    res.writeHead(200, {'Content-Type': 'text/html'})
    res.end(this.webpage.html())
  }

  const httpServer = http.createServer(httpRouter).listen(3078)
  console.log(`UI Tools page is live on http://localhost:${httpServer.address().port}`)
}

module.exports = DevTools
