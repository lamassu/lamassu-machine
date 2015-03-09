#!/usr/bin/env node
'use strict'

var argv = require('minimist')(process.argv.slice(2))
var uuid = require('uuid')

var _coinAddress = argv.a

if (!_coinAddress) usage()

var traderConfig = {
  protocol: 'http',
  settings: {
    pollInterval: 5000,
    tradeInterval: 10000,
    retryInterval: 5000,
    sendTimeout: 30000,
    pollTimeout: 10000
  }
}

var connectionInfo = {
  host: 'localhost',
  port: 3000
}

var _connected = false
var trader = require('../lib/trader')(traderConfig)
trader.init(connectionInfo)
trader.run()

console.log('Connecting to lamassu-server...')
var connectTimeout = setTimeout(function () {
  if (_connected) return
  console.log('Could not connect to lamassu-server on localhost:3000. Exiting.')
  process.exit(1)
}, 10000)

trader.on('error', function (err) { console.log(err.stack) })
trader.on('pollUpdate', pollUpdate)

var _currency = null
function pollUpdate () {
  if (_connected) return

  console.log('Connected.\n')
  _connected = true
  clearTimeout(connectTimeout)
  var locale = trader.locale.localeInfo.primaryLocale
  _currency = trader.locale.currency
  var fiatBalance = trader.balance.toFixed(2) + ' ' + _currency
  console.log('Exchange rate: %d, Fiat balance: %s, Locale: %s, TxLimit: %d',
    trader.exchangeRate.toFixed(2), fiatBalance, locale, trader.txLimit)
  ready()
}

var _sessionId = uuid.v4()
console.log('New sessionId: %s', _sessionId)
var _satoshis = 0
var _fiat = 0
var _tradeRec

function insertBillMachine (denomination) {
  var exchangeRate = trader.exchangeRate
  var satoshis = computeSatoshis(denomination, exchangeRate)
  _tradeRec = {
    currency: _currency,
    uuid: uuid.v4(),
    deviceTime: Date.now(),
    toAddress: _coinAddress,
    exchangeRate: exchangeRate,
    fiat: denomination,
    satoshis: satoshis
  }
  _satoshis += satoshis
  _fiat += denomination
}

function insertBillTrader () {
  trader.trade(_tradeRec, function (err, result) {
    if (err) console.log(err)
    else console.dir(result)
  })
}

function insertBill (denomination) {
  insertBillMachine(denomination)
  insertBillTrader()
}

function sendCoins (callback) {
  var tx = {
    toAddress: _coinAddress,
    currencyCode: _currency,
    fiat: _fiat,
    satoshis: _satoshis
  }
  trader.sendBitcoins(tx, callback)
}

function ready () {
  trader.sessionId = _sessionId
  insertBill(1)
  insertBillMachine(1)

  console.log('Sending coins...')

  setTimeout(function () {
    insertBillTrader()
  }, 8000)

  setTimeout(function () {
    sendCoins(function (err, txHash) {
      trader.stop()
      if (err) throw err
      console.log('Transaction successful: %s', txHash)
    })
  }, 12000)
}

function computeSatoshis (fiat, exchangeRate) {
  return Math.floor((fiat * 1e8) / exchangeRate)
}

function usage () {
  console.log('mock -a <bitcoin address>')
  process.exit(2)
}
