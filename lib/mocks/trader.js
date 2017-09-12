'use strict'

const _ = require('lodash/fp')

var util = require('util')
var EventEmitter = require('events').EventEmitter
var minimist = require('minimist')

const BN = require('../bn')
const BillMath = require('../bill_math')

var commandLine = minimist(process.argv.slice(2), {string: 'cryptoIn'})
var fiatCode = commandLine.fiat || 'EUR'
var toAddress = commandLine.cryptoIn

var Trader = function () {
  if (!(this instanceof Trader)) return new Trader()
  EventEmitter.call(this)

  this.txLimit = BN(100)
  this.fiatTxLimit = BN(150)
  this.zeroConfLimit = 20
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
  this.cassettes = [
    {denomination: BN(5), count: 10},
    {denomination: BN(10), count: 10}
  ]
  this.virtualCassettes = [BN(100)]
  this.cassettesUpdateId = 16
  this.coins = ['BTC']
  this.balances = {BTC: BN(100)}
  this._rates = {
    BTC: {
      cashIn: BN(450.05),
      cashOut: BN(443.23)
    },
    ETH: {
      cashIn: BN(11.05),
      cashOut: BN(10.23)
    },
    ZEC: {
      cashIn: BN(11.06),
      cashOut: BN(10.24)
    }
  }
}
util.inherits(Trader, EventEmitter)

module.exports = Trader

Trader.prototype.init = function init () {}

Trader.prototype.poll = function poll () {
  this.emit('pollUpdate')
  this.emit('networkUp')
  return Promise.resolve()
}

Trader.prototype.clearConfigVersion = function clearConfigVersion () {
}

Trader.prototype.setConfigVersion = function setConfigVersion () {
}

Trader.prototype.run = function run () {
  console.log('Using mock trader')
  return Promise.resolve()
}

Trader.prototype.stateChange = function stateChange (state, isIdle) {
  console.log('Trader: Changed state to: %s', state)
  console.log('Idle: %s', isIdle)
}

Trader.prototype.resetId = function resetId () {
  this.idData = {}
}

Trader.prototype.verifyUser = function verifyUser (idRecord) {
  console.log(util.inspect(idRecord, {depth: null, colors: true}))
  var response = {success: true}

  return new Promise(resolve => {
    setTimeout(function () {
      resolve(response)
    }, 1300)
  })
}

Trader.prototype.verifyTransaction = function verifyTransaction (idRecord) {
  console.log(util.inspect(idRecord, {depth: null, colors: true}))
  return
}

Trader.prototype.dispenseAck = function dispenseAck (tx) {
  console.log(util.inspect(tx, {depth: null, colors: true}))
}

Trader.prototype.rates = function rates (cryptoCode) {
  if (this._rates) return this._rates[cryptoCode]
  if (cryptoCode !== 'BTC') throw new Error('No rates record')

  return {
    cashIn: BN(this.exchangeRate.toFixed(15)),
    cashOut: BN(this.fiatExchangeRate.toFixed(15))
  }
}

Trader.prototype.phoneCode = function phoneCode (number, cb) {
  cb(null, {code: '123456'})
}

Trader.prototype.waitForDispense = function waitForDispense (tx, status) {
  return new Promise(resolve => {
    setTimeout(() => {
      tx.status = status === 'notSeen' ? 'published' : 'confirmed'
      resolve(tx)
    }, 3000)
  })
}

Trader.prototype.postTx = function postTx (_tx) {
  let tx

  if (_tx.dispense) {
    tx = _.set('bills', BillMath.makeChange(this.cassettes, _tx.fiat), _tx)
  } else if (_tx.send && _tx.direction === 'cashOut') {
    tx = _.set('toAddress', toAddress, _tx)
  } else {
    tx = _tx
  }

  console.log('DEBUG27: %j', [_tx, toAddress, tx])
  return new Promise(resolve => setTimeout(() => resolve(tx), 2000))
}
