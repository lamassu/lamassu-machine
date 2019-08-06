'use strict'

const EventEmitter = require('events').EventEmitter
const qs = require('querystring')
const util = require('util')
const uuid = require('uuid')
const _ = require('lodash/fp')

const BN = require('./bn')
const E = require('./error')

const mapValuesWithKey = _.mapValues.convert({ 'cap': false })

const _request = require('./request')
const logs = require('./logs')
const operatorInfo = require('./operator-info')

const NETWORK_DOWN_COUNT_THRESHOLD = 3
const DISPENSE_TIMEOUT = 120000
const NETWORK_TIMEOUT = 5000
const LOGS_SYNC_INTERVAL = 5000

let serialNumber = 0
let networkDownCount = 0
const pid = uuid.v4()

// TODO: need to pass global options to request
const Trader = function (protocol, clientCert, connectionInfo, dataPath) {
  if (!(this instanceof Trader)) return new Trader(protocol, clientCert, connectionInfo, dataPath)
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
  this.state = { state: 'initial', isIdle: false }
  this.configVersion = null
  this.dispenseIntervalPointer = null
  this.terms = false
  this.dataPath = dataPath
  this.operatorInfo = operatorInfo.load(dataPath)

  // Start logs sync
  setInterval(this.syncLogs.bind(this), LOGS_SYNC_INTERVAL)
  this.syncLogs()
}

util.inherits(Trader, EventEmitter)

/**
 * Synchronize logs with the server
 *
 * @name syncLogs
 * @function
 *
 * @returns {null}
 */
Trader.prototype.syncLogs = function syncLogs () {
  // Get last seen timestamp from server
  this.request({ path: '/logs', method: 'get' })
    .then(data => data.body)
  // Delete log files that are two or more days old
    .then((it) => {
      const twoDaysAgo = (() => {
        let date = new Date()

        // Notice that `setDate()` can take negative values. So if you'd take
        // -2 days on the 1st of April you'd get the 30th of March. Several
        // examples can be seen at: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/setDate#Using_setDate()
        date.setDate(date.getDate() - 2)
        return date
      })()

      return logs.removeLogFiles(twoDaysAgo).then(() => it)
    })
  // Load unseen logs to send
    .then(logs.queryNewestLogs)
  // Send unsaved logs to server
    .then(logs => {
      if (logs.length === 0) return
      return this.request({
        path: '/logs',
        method: 'POST',
        body: { logs }
      })
    })
    .catch(err => {
      if (err.code === 'ETIMEDOUT') return
      console.log('Sync logs error:', err)
    })
}

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

  if (tx.direction === 'cashIn') {
    return _.assign(tx, {
      cryptoAtoms: BN(tx.cryptoAtoms),
      fiat: BN(tx.fiat),
      cashInFee: BN(tx.cashInFee),
      commissionPercentage: BN(tx.commissionPercentage),
      minimumTx: BN(tx.minimumTx)
    })
  }

  return _.assign(tx, {
    cryptoAtoms: BN(tx.cryptoAtoms),
    commissionPercentage: BN(tx.commissionPercentage),
    fiat: BN(tx.fiat)
  })
}

Trader.prototype.postTx = function postTx (tx) {
  // Don't retry because that's handled at a higher level.

  const requestId = uuid.v4()

  return this.request({
    path: '/tx?rid=' + requestId,
    method: 'POST',
    body: tx,
    noRetry: true
  })
    .then(r => massage(r.body))
    .catch(err => {
      if (err.statusCode === 409) {
        const errorType = _.get('response.body.errorType', err, 'ratchet')

        console.log(`Encountered ${errorType} error, txId: %s ${tx.id}`)
        if (errorType === 'stale') throw new E.StaleError('Stale error')
        throw new E.RatchetError('Ratchet error')
      }

      if (err.statusCode >= 500) throw err
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

function stateChange (state, isIdle) {
  this.state = { state, isIdle }

  const rec = { state, isIdle, uuid: uuid.v4() }

  // Don't retry because we're only interested in the current state
  // and things could get confused.
  return this.request({
    path: '/state',
    method: 'POST',
    body: rec,
    noRetry: true
  }).catch(() => {})
}

// At machine startup two stateChanges occur virtually at the same time: 'idleState' and 'chooseCoin'
// It was frequently seen on the server requests arriving out of order, the throttle mitigates this issue
// This is particularlly important at startup because of the 'machine stuck' notification
Trader.prototype.stateChange = _.throttle(1000, stateChange)

Trader.prototype.phoneCode = function phoneCode (phone) {
  return this.request({
    path: '/phone_code',
    method: 'POST',
    body: { phone }
  })
    .then(r => r.body)
    .catch(err => {
      if (err && err.statusCode === 401) {
        const badNumberErr = new Error('Bad phone number')
        badNumberErr.name = 'BadNumberError'
        throw badNumberErr
      }

      throw err
    })
}

Trader.prototype.fetchPhoneTx = function fetchPhoneTx (phone) {
  return this.request({
    path: '/tx?' + qs.stringify({ phone }),
    method: 'GET'
  })
    .then(r => massage(r.body))
}

Trader.prototype.updateCustomer = function updateCustomer (customerId, customerPatch, txId) {
  return this.request({
    path: `/customer/${customerId}?txId=${txId}`,
    body: customerPatch,
    method: 'PATCH'
  })
    .then(r => r.body)
}

Trader.prototype.waitForOneDispense = function waitForOneDispense (tx, status) {
  return this.request({
    path: `/tx/${tx.id}?status=${status}`,
    method: 'GET',
    noRetry: true
  })
    .then(r => massage(r.body))
}

Trader.prototype.cancelDispense = function cancelDispense (tx) {
  this.cancelDispenseTx = tx && tx.id
  this.cancelDispenseFlag = true
}

Trader.prototype.waitForDispense = function waitForDispense (tx, status) {
  let processing = false
  let timedout = false
  const t0 = Date.now()

  // cancelDispense can be called before waitForDispense
  // make sure we're not undoing the cancel
  if (tx.id !== this.cancelDispenseTx) {
    this.cancelDispenseFlag = false
  }

  clearInterval(this.dispenseIntervalPointer)

  return new Promise((resolve, reject) => {
    let lastGood = Date.now()

    this.dispenseIntervalPointer = setInterval(() => {
      if (processing) return

      processing = true

      if (this.cancelDispenseFlag) {
        this.cancelDispenseFlag = false
        timedout = true
        clearInterval(this.dispenseIntervalPointer)
        return resolve()
      }

      if (Date.now() - t0 > DISPENSE_TIMEOUT) {
        timedout = true
        clearInterval(this.dispenseIntervalPointer)

        const err = new Error('Dispense timeout')
        err.networkDown = Date.now() - lastGood > NETWORK_TIMEOUT

        return reject(err)
      }

      this.waitForOneDispense(tx, status)
        .then(newTx => {
          processing = false

          if (!newTx || timedout) return

          clearInterval(this.dispenseIntervalPointer)

          return resolve(newTx)
        })
        .catch(err => {
          processing = false

          if (err.statusCode === 304) {
            lastGood = Date.now()
          }

          if (timedout || isNetworkError(err)) return

          clearInterval(this.dispenseIntervalPointer)
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
  this.idVerificationLimit = res.idVerificationLimit
  this.idVerificationEnabled = res.idVerificationEnabled
  this.smsVerificationActive = res.smsVerificationActive
  this.smsVerificationThreshold = res.smsVerificationThreshold
  this.hardLimitVerificationActive = res.hardLimitVerificationActive
  this.receiptPrintingActive = res.receiptPrintingActive
  this.hardLimitVerificationThreshold = (this.hardLimitVerificationActive)
    ? BN(res.hardLimitVerificationThreshold)
    : BN(Infinity)
  this.idCardDataVerificationActive = res.idCardDataVerificationActive
  this.idCardDataVerificationThreshold = res.idCardDataVerificationThreshold
  this.idCardPhotoVerificationActive = res.idCardPhotoVerificationActive
  this.idCardPhotoVerificationThreshold = res.idCardPhotoVerificationThreshold
  this.sanctionsVerificationActive = res.sanctionsVerificationActive
  this.sanctionsVerificationThreshold = res.sanctionsVerificationThreshold
  this.frontCameraVerificationActive = res.frontCameraVerificationActive
  this.frontCameraVerificationThreshold = res.frontCameraVerificationThreshold
  this.locale = res.locale
  this.hasLightning = res.hasLightning
  this.terms = res.terms || false
  this.operatorInfo = res.operatorInfo

  operatorInfo.save(this.dataPath, res.operatorInfo)
    .catch(err => console.log('failure saving operator info', err))

  networkDownCount = 0

  if (res.cassettes) {
    const mapper = (v, k) => k === 'denomination' ? BN(v) : v
    this.cassettes = _.map(mapValuesWithKey(mapper), res.cassettes.cassettes)
    this.virtualCassettes = _.map(BN, res.cassettes.virtualCassettes)
  }

  this.twoWayMode = res.twoWayMode
  this.zeroConfLimit = res.zeroConfLimit
  this._rates = _.mapValues(_.mapValues(toBN), res.rates)
  this.coins = _.filter(coin => isActiveCoin(res, coin), _.map(_.mapValues(toBN), res.coins))
  this.balances = _.mapValues(toBN, res.balances)
  this.latestConfigVersion = res.configVersion

  if (_.isEmpty(this.coins)) {
    return this.emit('networkDown')
  }

  if (res.reboot) this.emit('reboot')
  if (res.restartServices) this.emit('restartServices')
  this.emit('pollUpdate', isNewState(this))
  this.emit('networkUp')
}

Trader.prototype.pollError = function pollError (err) {
  if (isNetworkError(err)) {
    networkDownCount++

    if (networkDownCount > NETWORK_DOWN_COUNT_THRESHOLD) {
      return this.emit('networkDown')
    }

    console.log('WARNING: Ephemeral network error [%s]', err.message)

    return
  }

  if (err.statusCode === 403) return this.emit('unpair')

  console.log(err)
  this.emit('networkDown')
}

let oldState = {}
function isNewState (res) {
  const pare = r => ({
    twoWayMode: r.twoWayMode,
    locale: r.locale,
    coins: _.map('cryptoCode', r.coins)
  })

  if (_.isEqual(pare(res), oldState)) return false

  oldState = pare(res)
  return true
}

function isActiveCoin (res, coin) {
  return !_.isNil(res.rates[coin.cryptoCode]) && !_.isNil(res.balances[coin.cryptoCode])
}

module.exports = Trader
