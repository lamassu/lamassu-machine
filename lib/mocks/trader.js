'use strict'

var util = require('util')
var EventEmitter = require('events').EventEmitter
var minimist = require('minimist')

var commandLine = minimist(process.argv.slice(2))
var currency = commandLine.fiat || 'EUR'
var incomingAddress = commandLine.btcIn

var Trader = function () {
  if (!(this instanceof Trader)) return new Trader()
  EventEmitter.call(this)

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
    {denomination: 5, count: 0},
    {denomination: 10, count: 0}
  ]
  this.virtualCartridges = [100]
  this.cartridgesUpdateId = 15
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

Trader.prototype.trade = function trade (rec, cb) { cb() }

Trader.prototype.sendBitcoins = function sendBitcoins (tx, cb) {
  console.log('Server: sending bitcoins: %s', tx.satoshis)
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
