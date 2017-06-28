'use strict'

const EventEmitter = require('events').EventEmitter
const qs = require('querystring')
const util = require('util')
const uuid = require('uuid')
const _ = require('lodash/fp')

const BN = require('./bn')

const mapValuesWithKey = _.mapValues.convert({ 'cap': false })

const _request = require('./request')

const POLL_TIMEOUT = 10000
const DISPENSE_TIMEOUT = 120000

let _t0 = null
let serialNumber = 0
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

  this.request = options => _request.request(this.configVersion, globalOptions, options)
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
  return this.request({
    path: '/verify_user',
    method: 'POST',
    body: idRec
  })
}

Trader.prototype.rates = function rates (cryptoCode) {
  if (this._rates) return this._rates[cryptoCode]
}

Trader.prototype.verifyTransaction = function verifyTransaction (idRec) {
  console.log(idRec)

  return this.request({
    path: '/verify_transaction',
    method: 'POST',
    body: idRec
  }).catch(err => console.log(err))
}

Trader.prototype.reportEvent = function reportEvent (eventType, note) {
  const rec = {
    eventType: eventType,
    note: note,
    deviceTime: Date.now()
  }

  return this.request({
    path: '/event',
    method: 'POST',
    body: rec
  }).catch(err => console.log(err.stack))
}

Trader.prototype.poll = function poll () {
  const stateRec = this.state

  const path = '/poll?state=' + stateRec.state + '&idle=' + stateRec.isIdle + '&pid=' + pid + '&sn=' + serialNumber.toString()
  serialNumber++

  return this.request({
    path,
    method: 'GET',
    noRetry: true
  })
  .then(r => this.pollHandler(r.body))
  .catch(err => this.pollError(err))
}

function massage (tx) {
  if (!tx) return tx
  return _.assign(tx, {cryptoAtoms: BN(tx.cryptoAtoms), fiat: BN(tx.fiat)})
}

Trader.prototype.postTx = function postTx (tx) {
  // Don't retry because that's handled at a higher level.
  return this.request({
    path: '/tx',
    method: 'POST',
    body: tx,
    noRetry: true
  })
  .then(r => massage(r.body))
  .catch(err => {
    if (isNetworkError(err)) return
    throw err
  })
}

function isNetworkError (err) {
  switch (err.name) {
    case 'RequestError':
    case 'ReadError':
    case 'ParseError':
      return true
    default:
      return false
  }
}

Trader.prototype.stateChange = function stateChange (state, isIdle) {
  this.state = {state: state, isIdle: isIdle}

  const rec = {state: state, isIdle: isIdle, uuid: uuid.v4()}

  // Don't retry because we're only interested in the current state
  // and things could get confused.
  return this.request({
    path: '/state',
    method: 'POST',
    body: rec,
    noRetry: true
  }).catch(() => {})
}

Trader.prototype.phoneCode = function phoneCode (phone) {
  return this.request({
    path: '/phone_code',
    method: 'POST',
    body: {phone}
  })
  .then(r => r.body)
  .catch(err => {
    if (err && err.statusCode === 401) {
      const badNumberErr = new Error('Bad phone number')
      badNumberErr.name = 'BadNumberError'
      throw (badNumberErr)
    }

    throw err
  })
}

Trader.prototype.fetchPhoneTx = function fetchPhoneTx (phone) {
  return this.request({
    path: '/tx?' + qs.stringify({phone}),
    method: 'GET'
  })
  .then(r => massage(r.body))
}

Trader.prototype.waitForOneDispense = function waitForOneDispense (tx, status) {
  return this.request({
    path: `/tx/${tx.id}?status=${status}`,
    method: 'GET',
    noRetry: true
  })
  .then(r => massage(r.body))
}

Trader.prototype.waitForDispense = function waitForDispense (tx, status) {
  let processing = false
  let timedout = false
  const t0 = Date.now()

  return new Promise((resolve, reject) => {
    const intervalHandle = setInterval(() => {
      if (processing) return

      processing = true
      if (Date.now() - t0 > DISPENSE_TIMEOUT) {
        timedout = true
        clearInterval(intervalHandle)
        this.emit('networkDown')
        return reject(new Error('Dispense timeout'))
      }

      this.waitForOneDispense(tx, status)
      .then(newTx => {
        processing = false

        if (timedout) return

        clearInterval(intervalHandle)

        return resolve(newTx)
      })
      .catch(err => {
        processing = false

        if (isNetworkError(err) || err.statusCode === 304) return

        clearInterval(intervalHandle)
        return reject(err)
      })
    }, 1000)
  })
}

function toBN (obj) {
  try {
    return BN(obj)
  } catch (__) {
    return obj
  }
}

Trader.prototype.pollHandler = function pollHandler (res) {
  _t0 = null

  this.txLimit = BN(res.txLimit || Infinity)
  this.fiatTxLimit = BN(res.fiatTxLimit || Infinity)
  this.idVerificationLimit = res.idVerificationLimit
  this.idVerificationEnabled = res.idVerificationEnabled
  this.smsVerificationEnabled = res.smsVerificationEnabled

  this.locale = res.locale

  if (res.cassettes) {
    const mapper = (v, k) => k === 'denomination' ? BN(v) : v
    this.cassettes = _.map(mapValuesWithKey(mapper), res.cassettes.cassettes)
    this.virtualCassettes = _.map(BN, res.cassettes.virtualCassettes)
  }

  this.twoWayMode = res.twoWayMode
  this.zeroConfLimit = res.zeroConfLimit
  this._rates = _.mapValues(_.mapValues(toBN), res.rates)
  this.coins = _.filter(coin => isActiveCoin(res, coin), _.mapValues(_.mapValues(toBN), res.coins))
  this.balances = _.mapValues(toBN, res.balances)
  this.latestConfigVersion = res.configVersion

  if (_.isEmpty(this.coins)) {
    console.log('No responsive coins, going to Network Down.')
    return this.emit('networkDown')
  }

  this.newState = isNewState(res)

  if (res.reboot) this.emit('reboot')
  this.emit('pollUpdate')
  this.emit('networkUp')
}

Trader.prototype.networkDown = function networkDown () {
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

Trader.prototype.pollError = function pollError (err) {
  if (isNetworkError(err)) return this.networkDown()

  _t0 = null
  if (err.statusCode === 403) return this.emit('unpair')

  console.log(err)
  this.emit('networkDown')
}

let oldState = {}
function isNewState (res) {
  const pare = r => ({
    twoWayMode: r.twoWayMode,
    locale: r.locale,
    coins: _.keys(r.rates)
  })

  if (_.isEqual(pare(res), pare(oldState))) return false

  oldState = res
  return true
}

function isActiveCoin (res, coin) {
  return !_.isNil(res.rates[coin.cryptoCode]) && !_.isNil(res.balances[coin.cryptoCode])
}

module.exports = Trader
