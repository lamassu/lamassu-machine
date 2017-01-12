'use strict'

const EventEmitter = require('events').EventEmitter
const util = require('util')
const uuid = require('uuid')
const _ = require('lodash/fp')

const BN = require('./bn')

const mapValuesWithKey = _.mapValues.convert({ 'cap': false })

const _request = require('./request')

const POLL_TIMEOUT = 60000
const DISPENSE_TIMEOUT = 120000

let _t0 = null
let sequenceNumber = 0
const pid = uuid.v4()

// TODO: need to pass global options to request
const Trader = function (protocol, clientCert, connectionInfo) {
  if (!(this instanceof Trader)) return new Trader(protocol, clientCert, connectionInfo)
  EventEmitter.call(this)

  const globalOptions = {
    protocol,
    connectionInfo,
    clientCert
  }

  this.request = (options, cb) => _request.request(this.configVersion, globalOptions, options, cb)
  this.globalOptions = globalOptions
  this.balanceRetries = 0
  this.pollRetries = 0
  this.state = {state: 'initial', isIdle: false}
  this.configVersion = null
}
util.inherits(Trader, EventEmitter)

Trader.prototype.clearConfigVersion = function clearConfigVersion () {
  this.configVersion = null
}

Trader.prototype.setConfigVersion = function setConfigVersion () {
  if (!this.latestConfigVersion) throw new Error('We don\'t have a configVersion')
  this.configVersion = this.latestConfigVersion
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
  const rec = {
    eventType: eventType,
    note: note,
    deviceTime: Date.now()
  }
  this.request({
    path: '/event',
    method: 'POST',
    body: rec
  }, function (err) {
    if (err) console.log(err)
  })
}

Trader.prototype.poll = function poll (cb) {
  const self = this

  const stateRec = this.state

  const path = '/poll?state=' + stateRec.state + '&idle=' + stateRec.isIdle + '&pid=' + pid

  this.request({
    path,
    method: 'GET'
  }, function (err, body) {
    self._pollHandler(err, body)
    if (cb) cb()
  })
}

Trader.prototype.postTx = function postTx (tx) {
  return this.request({
    path: '/tx',
    method: 'POST',
    body: tx,
    noRetry: true
  })
}

Trader.prototype.stateChange = function stateChange (state, isIdle) {
  this.state = {state: state, isIdle: isIdle}

  const rec = {state: state, isIdle: isIdle, uuid: uuid.v4()}
  this.request({
    path: '/state',
    method: 'POST',
    body: rec,
    noRetry: true
  }, function () {})
}

Trader.prototype.phoneCode = function phoneCode (number, cb) {
  this.request({
    path: '/phone_code',
    method: 'POST',
    body: {phone: number}
  }, function (err, res) {
    if (err && err.statusCode === 401) {
      const badNumberErr = new Error('Bad phone number')
      badNumberErr.name = 'BadNumberError'
      return cb(badNumberErr)
    }

    if (err) return cb(err)

    cb(null, res)
  })
}

Trader.prototype.waitForDispense = function waitForDispense (tx, status, cb) {
  let processing = false
  const t0 = Date.now()
  const intervalHandle = setInterval(() => {
    if (processing) return
    processing = true
    this.waitForOneDispense(tx, status, (err, res) => {
      processing = false

      if (Date.now() - t0 > DISPENSE_TIMEOUT) {
        clearInterval(intervalHandle)
        return cb(err, res)
      }

      if (err) return

      clearInterval(intervalHandle)
      return cb(err, res)
    })
  }, 1000)
}

Trader.prototype._pollHandler = function _pollHandler (err, res) {
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

  if (!res) return

  this.txLimit = res.txLimit
  this.fiatTxLimit = res.fiatTxLimit
  this.idVerificationLimit = res.idVerificationLimit
  this.idVerificationEnabled = res.idVerificationEnabled
  this.smsVerificationEnabled = res.smsVerificationEnabled

  this.locale = res.locale

  if (res.cartridges) {
    const mapper = (v, k) => k === 'denomination' ? BN(v) : v
    this.cartridges = _.map(mapValuesWithKey(mapper), res.cartridges.cartridges)
    this.virtualCartridges = _.map(BN, res.cartridges.virtualCartridges)
  }

  this.twoWayMode = res.twoWayMode
  this.fiatTxLimit = res.fiatTxLimit
  this.zeroConfLimit = res.zeroConfLimit
  this._rates = _.mapValues(_.mapValues(BN), res.rates)
  this.balances = _.mapValues(BN, res.balances)
  this.coins = filterCoins(res)
  this.latestConfigVersion = res.configVersion

  if (this.coins.length === 0) {
    console.log('No responsive coins, going to Network Down.')
    return this.emit('networkDown')
  }

  if (res.reboot) this.emit('reboot')
  this.emit('pollUpdate')
  this.emit('networkUp')
}

function filterCoins (res) {
  const coins = res.coins || ['BTC']
  return coins.filter(function (coin) {
    return !_.isNil(res.rates[coin]) && !_.isNil(res.balances[coin])
  })
}

module.exports = Trader
