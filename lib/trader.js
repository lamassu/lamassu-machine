'use strict'

var fs = require('fs')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var async = require('async')
var uuid = require('node-uuid')

var jsonquest = require('./jsonquest')

var _t0 = null
var sequenceNumber = 0
var pid = uuid.v4()

var Trader = function (config) {
  if (!(this instanceof Trader)) return new Trader(config)
  EventEmitter.call(this)

  this.connectionInfo = null
  this.protocol = config.protocol || 'https'
  this.rejectUnauthorized = typeof config.rejectUnauthorized === 'undefined' ?
    true :
    !!config.rejectUnauthorized

  this.config = config
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
  this.fiatTxLimit = 50  // TODO: make configurable
  this.idVerificationLimit = null
  this.idVerificationEnabled = false
  this.sessionId = null
  this.twoWayMode = false
}
util.inherits(Trader, EventEmitter)

Trader.prototype.init = function init (connectionInfo) {
  if (this.protocol === 'https') {
    this.cert = fs.readFileSync(this.config.certs.certFile)
    this.key = fs.readFileSync(this.config.certs.keyFile)
  }
  this.connectionInfo = connectionInfo

  jsonquest.setEmitter(this.emit)
}

Trader.prototype.pair = function pair (connectionInfo) {
  this.connectionInfo = connectionInfo
}

Trader.prototype._request = function _request (options, cb) {
  var protocol = this.protocol || 'https'
  var connectionInfo = this.connectionInfo
  var host = protocol === 'http' ? 'localhost' : connectionInfo.host
  var fingerprint = protocol === 'http' ? false : connectionInfo.fingerprint
  var self = this
  var sessionId = this.sessionId
  var headers = sessionId ? {'session-id': sessionId} : {}
  if (options.body) headers['content-type'] = 'application/json'

  function debug (msg) {
    if (options.repeatUntilSuccess) console.log(msg)
  }

  jsonquest({
    protocol: protocol,
    host: host,
    port: connectionInfo.port,
    cert: this.cert,
    key: this.key,
    rejectUnauthorized: this.rejectUnauthorized,
    method: options.method,
    path: options.path,
    body: options.body,
    headers: headers,
    fingerprint: fingerprint,
    repeatUntilSuccess: options.repeatUntilSuccess
  }, function (err, res, body) {
      if (sessionId && sessionId !== self.sessionId) {
        console.log('WARN: received a response from old sessionId: %s, ' +
        'current is: %s', sessionId, self.sessionId)
        return // No need to call handler
      }

      debug('DEBUG24')
      if (err) return cb(_richError(err.message, 'networkDown'))
      debug('DEBUG25')

      if (res.statusCode === 404) {
        self.connectionInfo = null
        return cb(_richError('Server has unpaired', 'unpair'))
      }

      debug('DEBUG26')

      // All 2xx codes are OK
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return cb(_richError('Server returned ' + res.statusCode + ': ' + body.err))
      }

      debug('DEBUG27')

      var errRec = body.err ? {name: body.errType, message: body.err} : null
      var result = body

      if (errRec) return cb(_richError(errRec.message, errRec.name))
      debug('DEBUG28')
      cb(null, result)
    })
}

Trader.prototype.run = function run () {
  var self = this

  self.trigger()
  self.triggerInterval = setInterval(function () {
    self.trigger()
  }, this.config.settings.pollInterval)
}

Trader.prototype.stop = function stop () {
  if (this.triggerInterval) clearInterval(this.triggerInterval)
}

Trader.prototype.verifyUser = function verifyUser (idRec, cb) {
  console.log(idRec)
  this._request({
    path: '/verify_user',
    method: 'POST',
    body: idRec
  }, cb)
}

Trader.prototype.verifyTransaction = function verifyTransaction (idRec) {
  console.log(idRec)
  this._request({
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
  this._request({
    path: '/event',
    method: 'POST',
    body: rec,
    repeatUntilSuccess: true
  }, function (err) {
      if (err) console.log(err)
    })
}

Trader.prototype.sendBitcoins = function sendBitcoins (tx, cb) {
  tx.sequenceNumber = ++sequenceNumber

  // For backwards compatibility with lamassu-server@1.0.2
  tx.txId = uuid.v4()

  this._request({
    path: '/send',
    method: 'POST',
    body: tx,
    repeatUntilSuccess: true
  }, function (err, result) {
      console.log('DEBUG29')

      if (!err) {
        console.log('DEBUG30')
        cb(null, result.txHash)
      } else {
        console.log('DEBUG31: %s', err)
        if (err.name === 'InsufficientFunds') return cb(err)
        if (err.name === 'networkDown') return cb(new Error('sendBitcoins timeout'))
        return cb(new Error('General server error'))
      }
    })

  sequenceNumber = 0
}

Trader.prototype.trigger = function trigger () {
  var self = this

  // Not paired yet
  if (this.connectionInfo === null) return

  self._request({
    path: '/poll?pid=' + pid,
    method: 'GET'
  }, function (err, body) {
      self._pollHandler(err, body)
    })
}

Trader.prototype.trade = function trade (rec, cb) {
  rec.sequenceNumber = ++sequenceNumber
  this._request({
    path: '/trade',
    method: 'POST',
    body: rec,
    repeatUntilSuccess: true
  }, cb)
}

Trader.prototype.raqia = function raqia (cb) {
  this._request({
    path: '/raqia',
    method: 'GET',
    repeatUntilSuccess: true
  }, cb)
}

Trader.prototype.cashOut = function cashOut (tx, cb) {
  var config = this.config
  var result = null
  var t0 = Date.now()
  var timeOut = config.settings.sendTimeout
  var interval = config.settings.retryInterval
  var self = this

  function _cashOut (cb) {
    self._request({
      path: '/cash_out',
      method: 'POST',
      body: tx
    }, function (err, body) {
        if (!err && body) result = body.bitcoinAddress
        if (err || result === null) return setTimeout(cb, interval)
        cb()
      })
  }

  function testResponse () {
    return result !== null || Date.now() - t0 > timeOut
  }

  function handler (err) {
    if (err) return cb(err)
    if (result === null) return cb(new Error('cashOut timeout'))
    cb(null, result)
  }

  async.doUntil(_cashOut, testResponse, handler)
}

// Private functions

// TODO: repeat until success
Trader.prototype.dispenseAck = function dispenseAck (tx, cartridges) {
  this._request({
    path: '/dispense_ack',
    method: 'POST',
    body: {tx: tx, cartridges: cartridges}
  }, function (err) {
      if (err) console.log(err)
    })
}

Trader.prototype._pollHandler = function _pollHandler (err, res) {
  if (err && err.name === 'networkDown') {
    if (_t0 === null) {
      _t0 = Date.now()
      return
    }

    if (Date.now() - _t0 > this.config.settings.pollTimeout) {
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

  this.txLimit = res.txLimit
  this.idVerificationLimit = res.idVerificationLimit
  this.idVerificationEnabled = res.idVerificationEnabled
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

  if (res.reboot) this.emit('reboot')
  this.emit('pollUpdate')
  this.emit('networkUp')
}

function toInt (str) {
  return parseInt(str, 10)
}

function _richError (errMessage, name) {
  var err = new Error(errMessage)
  err.name = name
  return err
}

module.exports = Trader
