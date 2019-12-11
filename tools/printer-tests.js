const minimist = require('minimist')
const SerialPort = require('serialport')

const BN = require('../lib/bn')
const coinUtils = require('../lib/coins/utils')
const printerLoader = require('../lib/printer/loader')

const deviceConfig = require('../device_config.json')

const printType = process.argv[2]

if (!printType || (printType !== 'wallet' && printType !== 'receipt')) {
  console.log('usage: node printer-tests.js <type>')
  console.log(`type can be one of: 'wallet' or 'receipt'`)
}

printerLoader.load(deviceConfig.kioskPrinter)
  .then(printer => {
    if (printType === 'wallet') {
      const wallet = coinUtils.createWallet('BTC')
      printer.printWallet(wallet, deviceConfig.kioskPrinter)
    }

    if (printType === 'receipt') {
      const cashInCommission = BN(1.1)

      const rate = BN(10000).mul(cashInCommission).round(5)
      const date = new Date()

      const dateString = `${date.toISOString().replace('T', ' ').slice(0, 19)} UTC`

      const data = {
        operatorInfo: {
          name: 'Mock crypto seller',
          website: 'mockcryptoseller.com',
          email: 'me@mockcryptoseller.com'
        },
        location: 'street fake address, n10',
        customer: 'Anonymous',
        session: '03517180-258b-48f6-a4b4-0c2fc7fb4942',
        time: dateString,
        direction: 'Cash-in',
        fiat: '10 EUR',
        crypto: '0.0001 BTC',
        rate: `1 BTC = ${rate} EUR`,
        address: '1F1tAaz5x1HUXrCNLbtMDqcw6o5GNn4xqX',
        txId: '<txHash>'
      }
      printer.printReceipt(data, deviceConfig.kioskPrinter)
    }
  }).catch(console.log)
