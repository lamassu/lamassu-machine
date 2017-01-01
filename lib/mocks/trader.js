'use strict'

var BigNumber = require('bignumber.js')
var util = require('util')
var EventEmitter = require('events').EventEmitter
var minimist = require('minimist')

var commandLine = minimist(process.argv.slice(2), {string: 'cryptoIn'})
var fiatCode = commandLine.fiat || 'EUR'
var incomingAddress = commandLine.cryptoIn

var phoneTx

function BN (s) {
  return new BigNumber(s)
}

var Trader = function () {
  if (!(this instanceof Trader)) return new Trader()
  EventEmitter.call(this)

  this.exchangeRate = BN(12.45)
  this.fiatExchangeRate = BN(1001.12)
  this.fiatTxLimit = 150
  this.zeroConfLimit = 20
  this.balance = BN(100)
  this.txLimit = 100
  this.idVerificationLimit = null
  this.idVerificationEnabled = false
  this.idData = null
  this.isMock = true
  this.fiatCode = fiatCode
  this.locale = {fiatCode, localeInfo: {
    primaryLocale: 'en-US',
    primaryLocales: ['en-US', 'ja-JP', 'es-MX', 'he-IL', 'ar-SA'],
    country: 'US'
  }}
  this.twoWayMode = true
  this.cartridges = [
    {denomination: 5, count: 10},
    {denomination: 10, count: 10}
  ]
  this.virtualCartridges = [100]
  this.cartridgesUpdateId = 16
  this.coins = ['BTC']
  this.balances = {BTC: this.balance}
  this._rates = {
    BTC: {
      cashIn: BN(450.05),
      cashOut: BN(443.23)
    },
    ETH: {
      cashIn: BN(11.05),
      cashOut: BN(10.23)
    }
  }
}
util.inherits(Trader, EventEmitter)

module.exports = Trader

Trader.prototype.init = function init () {}

Trader.prototype.poll = function poll (cb) {
  this.emit('pollUpdate')
  this.emit('networkUp')
  if (cb) cb()
}

Trader.prototype.clearConfigVersion = function clearConfigVersion () {
}

Trader.prototype.setConfigVersion = function setConfigVersion () {
}

Trader.prototype.run = function run (cb) {
  console.log('Using mock trader')
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

Trader.prototype.stateChange = function stateChange (state, isIdle) {
  console.log('Trader: Changed state to: %s', state)
  console.log('Idle: %s', isIdle)
}

Trader.prototype.sendCoins = function sendCoins (tx, cb) {
  console.log('Server: sending coins: %s', tx.cryptoAtoms)
  console.log(JSON.stringify(tx, null, 2))
  this.balance -= tx.fiat
  console.log('Remaining balance: %d', this.balance)
  setTimeout(function () {
    cb(null, {txId: tx.id})
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
  phoneTx = tx
  cb(null, {toAddress: incomingAddress})
  console.dir(tx)
}

Trader.prototype.dispenseAck = function dispenseAck (tx) {
  console.log(util.inspect(tx, {depth: null, colors: true}))
}

Trader.prototype.rates = function rates (cryptoCode) {
  if (this._rates) return this._rates[cryptoCode]
  if (cryptoCode !== 'BTC') throw new Error('No rates record')

  return {
    cashIn: new BigNumber(this.exchangeRate.toFixed(15)),
    cashOut: new BigNumber(this.fiatExchangeRate.toFixed(15))
  }
}

Trader.prototype.phoneCode = function phoneCode (number, cb) {
  cb(null, {code: '123456'})
}

Trader.prototype.fetchPhoneTx = function fetchPhoneTx (number, cb) {
  cb(null, {tx: phoneTx})
}

Trader.prototype.updatePhone = function updatePhone (number, cb) {
  cb()
}

Trader.prototype.waitForDispense = function waitForDispense (tx, status, cb) {
  setTimeout(function () {
    tx.status = status === 'notSeen' ? 'published' : 'confirmed'
    cb(null, {tx})
  }, 3000)
}

Trader.prototype.dispense = function dispense (tx, cb) {
  cb(null, tx.id)
}

Trader.prototype.postTx = function postTx () {
  return new Promise(resolve => setTimeout(resolve, 1000))
}
