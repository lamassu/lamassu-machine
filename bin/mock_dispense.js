#!/usr/bin/env node
'use strict'

var argv = require('minimist')(process.argv.slice(2))
var uuid = require('uuid')

function usage () {
  console.log('mock_dispense [-a <amount to send>] [-c <currency>]')
  process.exit(2)
}

if (argv.h || argv.help) usage()

var amountToDispense = argv.a || 10
var currency = argv.c || 'USD'
var connected = false
var sessionId = uuid.v4()

var tx = {
  currencyCode: currency,
  fiat: amountToDispense
}

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

var trader = require('../lib/trader')(traderConfig)
trader.init(connectionInfo)
trader.run()

console.log('Connecting to lamassu-server...')
var connectTimeout = setTimeout(function () {
  if (connected) return
  console.log('Could not connect to lamassu-server on localhost:3000. Exiting.')
  process.exit(1)
}, 10000)

trader.on('error', function (err) { console.log(err.stack) })
trader.on('pollUpdate', pollUpdate)
trader.on('dispenseUpdate', function (dispenseStatus) {
  var status = dispenseStatus.status
  console.dir(dispenseStatus)
  if (status === 'rejected' || status === 'insufficentFunds') {
    console.log(status)
    process.exit(0)
  }

  if (status === 'authorized') {
    console.log('Dispensing...')
    tx.billDistribution = [
      {actualDispense: 1, rejected: 1},
      {actualDispense: 2, rejected: 0}
    ]
    trader.dispenseAck(tx)
  }
})

function pollUpdate () {
  if (connected) return

  console.log('Connected.\n')
  connected = true
  clearTimeout(connectTimeout)
  var locale = trader.locale.localeInfo.primaryLocale
  currency = trader.locale.currency
  var fiatBalance = trader.balance.toFixed(2) + ' ' + currency
  console.log('Exchange rate: %d, Fiat balance: %s, Locale: %s, TxLimit: %d',
    trader.exchangeRate.toFixed(2), fiatBalance, locale, trader.txLimit)
  ready()
}

function ready () {
  console.log('READY\n')
  trader.sessionId = sessionId

  tx.satoshis = computeSatoshis(amountToDispense, trader.exchangeRate)
  trader.cashOut(tx, function (err, address) {
    if (err) {
      return console.log(err)
    }

    tx.toAddress = address
    console.log(address)
  })
}

function computeSatoshis (fiat, exchangeRate) {
  return Math.floor((fiat * 1e8) / exchangeRate)
}
