'use strict'

const EventEmitter = require('events').EventEmitter
const util = require('util')
const uuid = require('node-uuid')
const BigNumber = require('bignumber.js')
const R = require('ramda')

const _request = require('./request')

const POLL_INTERVAL = 5000
const POLL_TIMEOUT = 60000
const SEND_TIMEOUT = 90000
const DISPENSE_TIMEOUT = 120000

var _t0 = null
var sequenceNumber = 0
var pid = uuid.v4()

// TODO: need to pass global options to request
var Trader = function (protocol, clientCert, connectionInfo, ca) {
  if (!(this instanceof Trader)) return new Trader(protocol, clientCert, connectionInfo, ca)
  EventEmitter.call(this)

  const globalOptions = {
    protocol,
    connectionInfo,
    ca,
    clientCert
  }

  this.request = (options, cb) => _request.request(globalOptions, options, cb)
  this.globalOptions = globalOptions
  this.exchangeRate = null
  this.fiatExchangeRate = null
  this.balance = null
  this.locale = null

  this.exchange = null
  this.balanceTimer = null
  this.balanceRetries = 0
  this.balanceTriggers = null
  this.tickerExchange = null
  this.transferExchange = null
  this.pollTimer = null
  this.pollRetries = 0
  this.txLimit = null
  this.fiatTxLimit = null
  this.idVerificationLimit = null
  this.idVerificationEnabled = false
  this.twoWayMode = false
  this.coins = []
  this.state = {state: 'initial', isIdle: false}
}
util.inherits(Trader, EventEmitter)

Trader.prototype.run = function run () {
  var self = this

  self.trigger()
  self.triggerInterval = setInterval(function () {
    self.trigger()
  }, POLL_INTERVAL)
}

Trader.prototype.stop = function stop () {
  if (this.triggerInterval) clearInterval(this.triggerInterval)
}

Trader.prototype.verifyUser = function verifyUser (idRec, cb) {
  console.log(idRec)
  this.request({
    path: '/verify_user',
    method: 'POST',
    body: idRec
  }, cb)
}

Trader.prototype.rates = function rates (cryptoCode) {
  if (this._rates) return this._rates[cryptoCode]
  if (cryptoCode !== 'BTC') throw new Error('No rates record')

  return {
    cashIn: new BigNumber(this.exchangeRate.toFixed(15)),
    cashOut: new BigNumber(this.fiatExchangeRate.toFixed(15))
  }
}

Trader.prototype.verifyTransaction = function verifyTransaction (idRec) {
  console.log(idRec)
  this.request({
    path: '/verify_transaction',
    method: 'POST',
    body: idRec
  }, function (err) {
    if (err) console.log(err)
  })
}

Trader.prototype.reportEvent = function reportEvent (eventType, note) {
  var rec = {
    eventType: eventType,
    note: note,
    deviceTime: Date.now()
  }
  this.request({
    path: '/event',
    method: 'POST',
    body: rec,
    repeatUntilSuccess: true
  }, function (err) {
    if (err) console.log(err)
  })
}

Trader.prototype.sendCoins = function sendCoins (tx, cb) {
  tx.sequenceNumber = ++sequenceNumber

  this.request({
    path: '/send',
    method: 'POST',
    body: tx,
    repeatUntilSuccess: true
  }, function (err, result) {
    if (!err) return cb(null, result)
    if (err.name === 'InsufficientFunds') return cb(err)
    if (err.name === 'networkDown') return cb(new Error('sendCoins timeout'))
    return cb(new Error('General server error'))
  })

  sequenceNumber = 0
}

Trader.prototype.trigger = function trigger () {
  var self = this

  console.log('DEBUG1')
  var stateRec = this.state
  this.request({
    path: '/poll?state=' + stateRec.state + '&idle=' + stateRec.isIdle + '&pid=' + pid,
    method: 'GET'
  }, function (err, body) {
    self._pollHandler(err, body)
  })
}

Trader.prototype.trade = function trade (rec, cb) {
  rec.sequenceNumber = ++sequenceNumber
  this.request({
    path: '/trade',
    method: 'POST',
    body: rec,
    repeatUntilSuccess: true
  }, cb)
}

Trader.prototype.stateChange = function stateChange (state, isIdle) {
  this.state = {state: state, isIdle: isIdle}

  var rec = {state: state, isIdle: isIdle, uuid: uuid.v4()}
  this.request({
    path: '/state',
    method: 'POST',
    body: rec
  }, function () {})
}

Trader.prototype.cashOut = function cashOut (tx, cb) {
  this.request({
    path: '/cash_out',
    method: 'POST',
    body: tx,
    retryTimeout: SEND_TIMEOUT
  }, cb)
}

Trader.prototype.phoneCode = function phoneCode (number, cb) {
  this.request({
    path: '/phone_code',
    method: 'POST',
    body: {phone: number}
  }, function (err, res) {
    if (err) return cb(err)
    if (res.statusCode === 401) {
      var badNumberErr = new Error('Bad phone number')
      badNumberErr.name = 'BadNumberError'
      return cb(badNumberErr)
    }
    cb(null, res)
  })
}

// This is just for backwards compatibility with Raqia
// Can be taken out after Raqia is decomissioned
Trader.prototype.updatePhoneNoNotify = function updatePhoneNoNotify (tx, cb) {
  this.request({
    path: '/update_phone?notified=true',
    method: 'POST',
    body: tx
  }, function (err, res) {
    if (err) return cb(err)

    if (res.noPhone) {
      var _err = new Error('Unknown phone number')
      _err.name = 'UnknownPhoneNumberError'
      return cb(_err)
    }

    return cb()
  })
}

Trader.prototype.updatePhone = function updatePhone (tx, cb) {
  this.request({
    path: '/update_phone',
    method: 'POST',
    body: tx
  }, function (err, res) {
    if (err) return cb(err)
    return cb()
  })
}

Trader.prototype.fetchPhoneTx = function fetchPhoneTx (phone, cb) {
  this.request({
    path: '/phone_tx?phone=' + encodeURIComponent(phone),
    method: 'GET'
  }, function (err, res) {
    if (err) return cb(err)

    if (res.pending) return cb(null, {})

    if (!res.tx) {
      var _err = new Error('Unknown phone number')
      _err.name = 'UnknownPhoneNumberError'
      return cb(_err)
    }

    var tx = res.tx
    tx.cryptoAtoms = new BigNumber(tx.cryptoAtoms)

    return cb(null, {tx: tx})
  })
}

Trader.prototype.waitForDispense = function waitForDispense (tx, status, cb) {
  this.request({
    path: '/await_dispense/' + tx.id + '?status=' + status,
    method: 'GET',
    retryTimeout: DISPENSE_TIMEOUT
  }, cb)
}

Trader.prototype.registerRedeem = function registerRedeem (txId) {
  this.request({
    path: '/register_redeem/' + txId,
    method: 'POST',
    repeatUntilSuccess: true
  }, function (err) {
    if (err) return console.log(err)
  })
}

Trader.prototype.dispense = function dispense (tx, cb) {
  this.request({
    path: '/dispense',
    method: 'POST',
    body: {tx: tx}
  }, function (err, res) {
    if (err) return cb(err)
    if (!res.dispense) return cb(new Error('Could not dispense: ' + res.reason))
    return cb(null, res.txId)
  })
}

// TODO: repeat until success
Trader.prototype.dispenseAck = function dispenseAck (tx, cartridges) {
  this.request({
    path: '/dispense_ack',
    method: 'POST',
    body: {tx: tx, cartridges: cartridges}
  }, function (err) {
    if (err) console.log(err)
  })
}

Trader.prototype._pollHandler = function _pollHandler (err, res) {
  console.log('DEBUG2: %s', err)
  if (err && err.name === 'networkDown') {
    if (_t0 === null) {
      _t0 = Date.now()
      return
    }

    if (Date.now() - _t0 > POLL_TIMEOUT) {
      _t0 = null
      this.emit('networkDown')
      return
    }
  }

  if (err && err.name === 'unpair') {
    this.emit('unpair')
    return
  }

  _t0 = null

  // Not a network error, so no need to keep trying
  if (err) {
    if (sequenceNumber === 0) this.emit('networkDown')

    return
  }

  console.log('DEBUG4')

  if (!res) return

  this.txLimit = res.txLimit
  this.fiatTxLimit = res.fiatTxLimit
  this.idVerificationLimit = res.idVerificationLimit
  this.idVerificationEnabled = false && res.idVerificationEnabled
  this.exchangeRate = res.rate
  this.fiatExchangeRate = res.fiatRate
  this.balance = res.fiat
  this.locale = res.locale
  if (res.cartridges) {
    this.cartridges = res.cartridges.cartridges
    this.virtualCartridges = res.cartridges.virtualCartridges.map(toInt)
    this.cartridgesUpdateId = res.cartridges.id
  }
  this.twoWayMode = res.twoWayMode
  this.fiatTxLimit = res.fiatTxLimit
  this.zeroConfLimit = res.zeroConfLimit
  this._rates = res.rates
  this.balances = res.balances
  this.coins = filterCoins(res)

  if (this.coins.length === 0) {
    console.log('No responsive coins, going to Network Down.')
    return this.emit('networkDown')
  }

  console.log('DEBUG5')

  if (res.reboot) this.emit('reboot')
  this.emit('pollUpdate')
  this.emit('networkUp')
}

function filterCoins (res) {
  var coins = res.coins || ['BTC']
  return coins.filter(function (coin) {
    return !R.isNil(res.rates[coin]) && !R.isNil(res.balances[coin])
  })
}

function toInt (str) {
  return parseInt(str, 10)
}

module.exports = Trader
