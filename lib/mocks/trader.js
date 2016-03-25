'use strict'

var BigNumber = require('bignumber.js')
var util = require('util')
var EventEmitter = require('events').EventEmitter
var minimist = require('minimist')

var commandLine = minimist(process.argv.slice(2), {string: 'cryptoIn'})
var currency = commandLine.fiat || 'EUR'
var incomingAddress = commandLine.cryptoIn

var Trader = function () {
  if (!(this instanceof Trader)) return new Trader()
  EventEmitter.call(this)

  this.rates = {
    BTC: {
      cashIn: new BigNumber('410.0345').div(1e8),
      cashOut: new BigNumber('412.2445923').div(1e8)
    },
    ETH: {
      cashIn: new BigNumber('11.324532').div(1e18),
      cashOut: new BigNumber('12.239273').div(1e18)
    }
  }

  this.exchangeRate = 12.45
  this.fiatExchangeRate = 1001.12
  this.fiatTxLimit = 150
  this.zeroConfLimit = 50
  this.balance = 100
  this.txLimit = 100
  this.idVerificationLimit = null
  this.idVerificationEnabled = false
  this.idData = null
  this.isMock = true
  this.locale = {currency: currency, localeInfo: {
    primaryLocale: 'en-US',
    primaryLocales: ['en-US', 'ja-JP', 'es-MX', 'he-IL', 'ar-SA'],
    country: 'US'
  }}
  this.twoWayMode = true
  this.cartridges = [
    {denomination: 5, count: 100},
    {denomination: 10, count: 100}
  ]
  this.virtualCartridges = [100]
  this.cartridgesUpdateId = 14
}
util.inherits(Trader, EventEmitter)

module.exports = Trader

Trader.prototype.init = function init () {}

Trader.prototype.run = function run () {
  console.log('Using mock trader')
  var self = this
  self.emit('pollUpdate')
  self.emit('networkUp')
  setInterval(function () {
    self.emit('pollUpdate')
    self.emit('networkUp')
  }, 3000)
}

Trader.prototype.setBalance = function setBalance (balance) {
  this.balance = balance
  if (balance < 10) this.emit('lowBalance')
}

Trader.prototype.trade = function trade (rec, cb) {
  console.log('Trade')
  console.log(JSON.stringify(rec, null, 2))
  cb()
}

Trader.prototype.sendCoins = function sendCoins (tx, cb) {
  console.log('Server: sending coins: %s', tx.cryptoUnits)
  console.log(JSON.stringify(tx, null, 2))
  this.balance -= tx.fiat
  console.log('Remaining balance: %d', this.balance)
  setTimeout(function () {
    cb(null, 'ed83b95940dbaecd845749d593a260819437838449f87b9257f25dfbd32f7fd6')
  }, 1000)
}

Trader.prototype.resetId = function resetId () {
  this.idData = {}
}

Trader.prototype.verifyUser = function verifyUser (idRecord, cb) {
  console.log(util.inspect(idRecord, {depth: null, colors: true}))
  var response = {success: true}
  var err = null

  setTimeout(function () {
    cb(err, response)
  }, 1300)
}

Trader.prototype.verifyTransaction = function verifyTransaction (idRecord) {
  console.log(util.inspect(idRecord, {depth: null, colors: true}))
  return
}

Trader.prototype.cashOut = function cashOut (tx, cb) {
  cb(null, incomingAddress)
  console.dir(tx)
}

Trader.prototype.dispenseAck = function dispenseAck (tx) {
  console.log(util.inspect(tx, {depth: null, colors: true}))
}
