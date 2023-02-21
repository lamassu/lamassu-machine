'use strict'

const EventEmitter = require('events').EventEmitter
const qs = require('querystring')
const util = require('util')
const uuid = require('uuid')
const _ = require('lodash/fp')
const semver = require('semver')

const BN = require('./bn')
const E = require('./error')

const version = require('../package.json').version

const mapValuesWithKey = _.mapValues.convert({ 'cap': false })

const _request = require('./request')
const logs = require('./logs')
const operatorInfo = require('./operator-info')
const machineInfo = require('./machine-info')
const { TRIGGER_TYPES, DIRECTIONS, REQUIREMENTS } = require('./compliance/triggers/consts')
const { gql, GraphQLClient } = require('./graphql-client')

const NETWORK_DOWN_COUNT_THRESHOLD = 3
const DISPENSE_TIMEOUT = 120000
const NETWORK_TIMEOUT = 5000
const LOGS_SYNC_INTERVAL = 60 * 1000

const argv = require('minimist')(process.argv.slice(2))
const PORT = argv.serverPort || 3000

const GRAPHQL_QUERY = gql`
query($configVersion: Int, $currentHash: String) {
  configs(currentConfigVersion: $configVersion) {
    static {
      coins {
        cryptoCode
        display
        minimumTx
        cashInFee
        cashInCommission
        cashOutCommission
        cryptoNetwork
        cryptoUnits
        batchable
        isCashInOnly
      }
      configVersion
      serverVersion
      timezone

      enablePaperWalletOnly
      hasLightning
      twoWayMode

      urlsToPing
      speedtestFiles {
        url
        size
      }

      localeInfo {
        country
        fiatCode
        languages
      }

      operatorInfo {
        name
        phone
        email
        website
        companyNumber
      }

      machineInfo {
        deviceId
        deviceName
      }

      receiptInfo {
        paper
        sms
        operatorWebsite
        operatorEmail
        operatorPhone
        companyNumber
        machineLocation
        customerNameOrPhoneNumber
        exchangeRate
        addressQRCode
      }

      triggersAutomation {
        sanctions
        idCardPhoto
        idCardData
        facephoto
        usSsn
        custom {
          id
          type
        }
      }

      triggers {
        id
        direction
        requirement
        triggerType

        suspensionDays
        threshold
        thresholdDays
        customInfoRequest {
          id
          enabled
          customRequest {
            name
            input {
              type
              constraintType
              label1
              label2
              choiceList
            }
            screen1 {
              text
              title
            }
            screen2 {
              text
              title
            }
          }
        }
      }
    }

    dynamic {
      areThereAvailablePromoCodes

      cassettes {
        physical {
          count
          denomination
        }
        virtual
      }

      coins {
        cryptoCode
        balance
        ask
        bid
        cashIn
        cashOut
        zeroConfLimit
      }

      reboot
      shutdown
      restartServices
    }
  }

  terms(currentHash: $currentHash, currentConfigVersion: $configVersion) {
    hash
    text
    details {
      delay
      title
      accept
      cancel
      tcPhoto
    }
  }
}
`

let serialNumber = 0
let networkDownCount = 0
let epipeLog = null
let epipePoll = null
const pid = uuid.v4()
let gqlClient = null

// TODO: need to pass global options to request
const Trader = function (protocol, clientCert, connectionInfo, dataPath, relayedModel) {
  if (!(this instanceof Trader)) return new Trader(protocol, clientCert, connectionInfo, dataPath, relayedModel)
  EventEmitter.call(this)

  const globalOptions = {
    protocol,
    connectionInfo,
    clientCert
  }

  const model = relayedModel ? relayedModel : 'unknown'
  gqlClient = GraphQLClient(connectionInfo.host, PORT, { model, pid, version })

  this.request = options => _request(this.configVersion, globalOptions, options)
  this.globalOptions = globalOptions
  this.model = model
  this.balanceRetries = 0
  this.pollRetries = 0
  this.state = { state: 'initial', isIdle: false }
  this.configVersion = null
  this.dispenseIntervalPointer = null
  this.terms = false
  this.termsHash = null
  this.dataPath = dataPath
  this.operatorInfo = operatorInfo.load(dataPath)
  this.areThereAvailablePromoCodes = null
  this.timezone = null

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
  epipeLog = new Date()
  this.request({ path: '/logs', method: 'get', noRetry: true })
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
        body: { logs },
        noRetry: true
      })
    })
    .catch(err => this.syncLogsError(err))
}

Trader.prototype.syncLogsError = function syncLogsError (err) {
  if (this.isUnauthorized(err)) {
    this.emit('unpair')
    return
  }
  // Ignore request timeout and forced timeout
  if ((err.code && err.code === 'ETIMEDOUT') || err.statusCode === 408) return
  if (this.state.state !== 'networkDown') console.log('Sync logs error:', err)
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

Trader.prototype.epipeLogs = function epipeLogs () {
  console.log(`EPIPE: Log last try: ${epipeLog}`)
  console.log(`EPIPE: Poll last try: ${epipePoll}`)
}

// BACKWARDS_COMPATIBILITY 8.1.0
// Servers before 8.1.0 don't have the GraphQL server
Trader.prototype.oldPoll = function oldPoll () {
  epipePoll = new Date()
  const stateRec = this.state
  const path = '/poll?state=' + stateRec.state
             + '&model=' + this.model
             + '&version=' + version
             + '&idle=' + stateRec.isIdle
             + '&pid=' + pid
             + '&sn=' + serialNumber.toString()
  serialNumber++

  return this.request({
    path,
    method: 'GET',
    noRetry: true
  })
    .then(r => {
      this.oldPollHandler(r.body)
      return this.isGraphqlPollEnabled()
    })
    .catch(err => {
      this.pollError(err)
      return true
    })
}

Trader.prototype.graphqlPoll = function graphqlPoll () {
  return gqlClient.query({
    query: GRAPHQL_QUERY,
    variables: {
      configVersion: this.latestConfigVersion || null,
      /* TODO: `isString` is unnecessary once we drop the old poller. */
      currentHash: _.isString(this.termsHash) ? this.termsHash : null,
    }
  })
    .then(r => {
      this.pollHandler(r.data)
      return false
    })
    .catch(err => {
      const _err = _.isNil(err.networkError) ? err : err.networkError
      this.pollError(_err)
      return true
    })
}

Trader.prototype.poll = function poll () {
  return this.isGraphqlPollEnabled() ? this.graphqlPoll() : this.oldPoll()
}

Trader.prototype.verifyPromoCode = function verifyPromoCode (code, tx) {
  return this.request({
    path: '/verify_promo_code',
    method: 'POST',
    body: { codeInput: code, tx: tx }
  }).then(r => { return r.body })
}

function massage (rawTx) {
  if (!rawTx) return rawTx

  const tx = _.omit(['txCustomerPhotoPath', 'txCustomerPhotoAt'], rawTx)

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
      if (this.isNetworkError(err)) return
      throw err
    })
}

// BACKWARDS_COMPATIBILITY 8.1.0
Trader.prototype.isGraphqlPollEnabled = function isGraphqlPollEnabled () {
  return this.serverVersion && semver.gte(this.serverVersion, '8.1.0-alpha.0')
}

Trader.prototype.isNetworkError = function (err) {
  switch (err.name) {
    case 'RequestError':
    case 'ReadError':
    case 'ParseError':
      return true
    default:
      return false
  }
}

Trader.prototype.isUnauthorized = function (err) {
  return err.statusCode === 403
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
    path: `/phone_code?version=${version}`,
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

Trader.prototype.updateTxCustomerPhoto = function updateTxCustomerPhoto (txId, customerId, photoPatch) {
  return this.request({
    path: `/customer/${customerId}/${txId}/photos/customerphoto`,
    body: photoPatch,
    method: 'PATCH'
  })
    .then(r => r.body)
}

Trader.prototype.updateCustomer = function updateCustomer (customerId, customerPatch, txId) {
  return this.request({
    path: `/customer/${customerId}?txId=${txId}&version=${version}`,
    body: customerPatch,
    method: 'PATCH'
  })
    .then(r => r.body)
}

Trader.prototype.updateIdCardPhotos = function updateIdCardPhotos (customerId, customerPatch) {
  return this.request({
    path: `/customer/${customerId}/photos/idcarddata`,
    body: customerPatch,
    method: 'PATCH'
  })
    .then(r => r.body)
}

Trader.prototype.triggerSanctions = function triggerSanctions (customerId) {
  return this.request({
    path: `/customer/${customerId}/sanctions`,
    method: 'patch'
  })
    .then(r => r.body)
}

Trader.prototype.triggerBlock = function triggerBlock (customerId) {
  return this.request({
    path: `/customer/${customerId}/block`,
    method: 'patch'
  })
    .then(r => r.body)
}

Trader.prototype.triggerSuspend = function triggerSuspend (customerId, triggerId) {
  return this.request({
    path: `/customer/${customerId}/suspend`,
    body: { triggerId: triggerId },
    method: 'patch'
  })
    .then(r => r.body)
}

Trader.prototype.smsReceipt = function smsReceipt (data, customerId) {
  return this.request({
    path: `/customer/${customerId}/smsreceipt`,
    body: { data },
    method: 'post'
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

Trader.prototype.notifyCashboxRemoval = function notifyCashboxRemoval () {
  return this.request({
    path: `/cashbox/removal`,
    method: 'POST',
    noRetry: true
  })
    .then(r => r.body)
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

          // l-s returns status code 304 with an empty body when no changes occur in the tx
          if (!newTx) {
            lastGood = Date.now()
            return
          }

          if (timedout) return

          clearInterval(this.dispenseIntervalPointer)

          return resolve(newTx)
        })
        .catch(err => {
          processing = false

          if (timedout || this.isNetworkError(err)) return

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

Trader.prototype.postPollEvents = function postPollEvents (res) {
  networkDownCount = 0

  if (_.isEmpty(this.coins)) {
    return this.emit('networkDown')
  }

  if (res.reboot) this.emit('reboot')
  if (res.shutdown) this.emit('shutdown')
  if (res.restartServices) this.emit('restartServices')
  this.emit('pollUpdate', isNewState(this))
  this.emit('networkUp')
}

Trader.prototype.pollHandler = function pollHandler (data) {
  let coinsRes = this.coins

  const handleStaticConfig = data => {
    /* If the config is up to date, there's nothing to do */
    if (!data) return

    this.latestConfigVersion = data.configVersion
    this.serverVersion = data.serverVersion
    this.timezone = data.timezone
    this.hasLightning = data.hasLightning
    this.machineInfo = data.machineInfo
    this.urlsToPing = data.urlsToPing
    this.speedtestFiles = data.speedtestFiles
    this.enablePaperWalletOnly = data.enablePaperWalletOnly
    this.twoWayMode = data.twoWayMode
    this.triggersAutomation = _.assign(
      _.omit(['custom'], data.triggersAutomation),
      _.reduce(
        (acc, value) => _.assign(acc, { [value.id]: value.type }),
        {},
        data.triggersAutomation.custom || []
      )
    )
    this.triggers = data.triggers
    this.receiptPrintingActive = data.receiptInfo && data.receiptInfo.paper
    this.smsReceiptActive = data.receiptInfo && data.receiptInfo.sms

    if (data.receiptInfo && (this.receiptPrintingActive || this.smsReceiptActive)) {
      this.receiptOptions = _.omit(['paper','sms'], data.receiptInfo)
    } else {
      this.receiptOptions = null
    }

    this.locale = {
      country: data.localeInfo.country,
      fiatCode: data.localeInfo.fiatCode,
      localeInfo: {
        primaryLocale: data.localeInfo.languages[0],
        primaryLocales: data.localeInfo.languages
      }
    }

    coinsRes = _.map(_.mapValues(toBN), data.coins)

    this.operatorInfo = data.operatorInfo ?
      _.flow(
        _.pick(['name', 'phone', 'email', 'website', 'companyNumber']),
        _.set('active', true)
      )(data.operatorInfo) :
      { active: false }
  }

  const handleDynamicConfig = data => {
    this.areThereAvailablePromoCodes = data.areThereAvailablePromoCodes

    const coins = _.flow(
      _.get('coins'),
      _.map(coin => [coin.cryptoCode, _.omit(['cryptoCode'], coin)]),
      _.fromPairs
    )(data)

    if (data.cassettes) {
      this.cassettes = _(data.cassettes.physical)
        .orderBy(['denomination'], ['asc'])
        .map(_.update('denomination', BN))
        .value()
      this.virtualCassettes = _.map(BN, data.cassettes.virtual)
    } else {
      this.cassettes = null
      this.virtualCassettes = null
    }

    this.balances = _.mapValues(_.flow(_.get('balance'), toBN), coins)

    this._rates = _.mapValues(
      _.flow(
        _.pick(['cashIn', 'cashOut']),
        _.update('cashIn', toBN),
        _.update('cashOut', toBN)
      ),
      coins
    )

    coinsRes = _.map(
      coin => _.set('rates', _.pick(['ask', 'bid'], coins[coin.cryptoCode]), coin),
      coinsRes
    )

    this.zeroConfLimits = _.mapValues(_.get('zeroConfLimit'), coins)
  }

  /*
   * There are 4 possibilities here:
   *
   * Nothing
   *   The T&C don't exist or were removed/disabled.
   *
   * Just (Nothing, _, _)
   *   Shouldn't happen! Treated as if there were no T&C.
   *
   * Just (Just hash, Nothing, Nothing)
   *   Both `hash` and `configVersion` should be equal to the cached ones --
   *   meaning the T&C haven't changed.
   *
   * Just (Just hash, Nothing, Just details)
   *   `configVersion` should differ from the cached one -- meaning the details
   *   may have changed.
   *
   * Just (Just hash, Just text, Just details)
   *   `hash` should differ from the cached one -- meaning the T&C have
   *   changed, and the details may have changed.
   */
  const handleTerms = terms => {
    const emptyTerms = () => {
      this.terms = false
      this.termsHash = null
    }

    if (!terms || !terms.hash) // T&C don't exist or were removed/disabled
      return emptyTerms()

    let details = this.terms

    // configVersion has increased; have to update title, delay, accept, &c
    if (terms.details) details = _.assign(details, terms.details)

    if (terms.hash !== this.termsHash) { // T&C changed
      if (!terms.text) return emptyTerms() // Shouldn't happen
      details = _.set('text', terms.text, details)
    }

    this.terms = _.flow(
      _.pick(['delay', 'title', 'text', 'accept', 'cancel', 'tcPhoto']),
      _.set('active', true)
    )(details)

    this.termsHash = terms.hash
  }

  handleStaticConfig(data.configs.static)
  handleDynamicConfig(data.configs.dynamic)
  handleTerms(data.terms)

  this.coins = _.filter(coin => isActiveCoin(this._rates, this.balances, coin.cryptoCode), coinsRes)

  return this.postPollEvents(_.pick(['reboot', 'shutdown', 'restartServices'], data.configs.dynamic))
}

Trader.prototype.oldPollHandler = function oldPollHandler (res) {
  this.serverVersion = res.version

  // BACKWARDS_COMPATIBILITY 8.1
  // Servers after 8.1 just return the server version on the old poller request, so no need to process further
  if (this.serverVersion && semver.gte(this.serverVersion, '8.1.0-alpha.0')) {
    return
  }

  this.locale = res.locale
  this.hasLightning = res.hasLightning
  this.operatorInfo = res.operatorInfo
  this.machineInfo = res.machineInfo
  this.receiptPrintingActive = res.receiptPrintingActive
  this.smsReceiptActive = res.smsReceiptActive
  this.receiptOptions = _.omit(['active', 'sms'], res.receipt)
  this.enablePaperWalletOnly = res.enablePaperWalletOnly
  this.triggersAutomation = res.triggersAutomation

  // BACKWARDS_COMPATIBILITY 7.5
  // Servers before 7.5 uses old compliance settings
  if (res.version && semver.gte(res.version, '7.5.0-beta.0')) {
    this.triggers = res.triggers
  } else {
    this.triggers = createCompatTriggers(res)
  }

  machineInfo.save(this.dataPath, res.machineInfo)
    .catch(err => console.log('failure saving machine info', err))

  operatorInfo.save(this.dataPath, res.operatorInfo)
    .catch(err => console.log('failure saving operator info', err))

  if (res.cassettes) {
    const mapper = (v, k) => k === 'denomination' ? BN(v) : v
    this.cassettes = _.map(mapValuesWithKey(mapper), _.orderBy(['denomination'], ['asc'], res.cassettes.cassettes))
    this.virtualCassettes = _.map(BN, res.cassettes.virtualCassettes)
  }

  this.twoWayMode = res.twoWayMode
  this._rates = _.mapValues(_.mapValues(toBN), res.rates)
  this.coins = _.flow(
    _.filter(coin => isActiveCoin(res.rates, res.balances, coin.cryptoCode)),
    _.map(_.mapValues(toBN))
  )(res.coins)

  this.balances = _.mapValues(toBN, res.balances)
  this.latestConfigVersion = res.configVersion
  this.areThereAvailablePromoCodes = res.areThereAvailablePromoCodes
  this.timezone = res.timezone

  // BACKWARDS_COMPATIBILITY 7.6.0
  // Servers before 7.6.0 send a single zeroConfLimit per machine.
  if (res.version && semver.gte(res.version, '7.6.0-beta.0')) {
    this.zeroConfLimits = res.zeroConfLimits
  } else {
    this.zeroConfLimits = _.fromPairs(_.map(c => [c.cryptoCode, res.zeroConfLimit], res.coins))
  }

  // BACKWARDS_COMPATIBILITY 7.4.9
  // Servers before 7.4.9 sends terms on poll
  if (res.version && semver.gte(res.version, '7.4.9')) {
    this.fetchTerms(res.configVersion)
  } else {
    this.terms = res.terms || false
  }

  // BACKWARDS_COMPATIBILITY 7.5.3
  // Servers before 7.5.3 don't send URLs to ping and for the speedtest.
  if (res.version && semver.gte(res.version, '7.5.3')) {
    this.urlsToPing = res.urlsToPing
    this.speedtestFiles = res.speedtestFiles
  } else {
    this.urlsToPing = [
      `us.archive.ubuntu.com`,
      `uk.archive.ubuntu.com`,
      `za.archive.ubuntu.com`,
      `cn.archive.ubuntu.com`
    ]
    this.speedtestFiles = [
      {
        url: `https://github.com/lamassu/speed-test-assets/raw/main/python-defaults_2.7.18-3.tar.gz`,
        size: 44668
      }
    ]
  }

  this.postPollEvents(res)
}

Trader.prototype.fetchTerms = function fetchTerms (configVersion) {
  if (this.isGraphqlPollEnabled()) return
  if (configVersion === this.termsHash) return

  return this.request({ path: '/terms_conditions', method: 'GET' })
    .then(({ body }) => {
      this.terms = (body && body.terms) || false
      this.termsHash = body && body.version
    })
    .catch(err => console.log('failure fetching terms and conditions', err))
}

Trader.prototype.pollError = function pollError (err) {
  if (this.isNetworkError(err)) {
    networkDownCount++

    if (networkDownCount > NETWORK_DOWN_COUNT_THRESHOLD) {
      return this.emit('networkDown')
    }

    console.log('Temporary network hiccup [%s]', err.message)

    return
  }

  if (this.isUnauthorized(err)) return this.emit('unpair')

  console.log(err)
  this.emit('networkDown')
}

Trader.prototype.networkHeartbeat = function networkHeartbeat (obj) {
  return this.request({
    path: '/network/heartbeat',
    body: obj,
    method: 'POST'
  })
  .catch(err => console.error('Failed to send network heartbeat', err))
}

Trader.prototype.networkPerformance = function networkPerformance (obj) {
  return this.request({
    path: '/network/performance',
    body: obj,
    method: 'POST'
  })
  .catch(err => console.error('Failed to send network performance', err))
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

function isActiveCoin (rates, balances, cryptoCode) {
  return !_.isNil(rates[cryptoCode])
      && !_.isNil(balances[cryptoCode])
}

function createCompatTriggers (res) {
  const newTrigger = _.assign({
    triggerType: TRIGGER_TYPES.TRANSACTION_VOLUME,
    direction: DIRECTIONS.BOTH,
    thresholdDays: 1
  })

  const requirements = [
    { name: 'sms', id: REQUIREMENTS.PHONE_NUMBER },
    { name: 'idCardData', id: REQUIREMENTS.ID_CARD_DATA },
    { name: 'idCardPhoto', id: REQUIREMENTS.ID_CARD_PHOTO },
    { name: 'sanctions', id: REQUIREMENTS.SANCTIONS },
    { name: 'frontCamera', id: REQUIREMENTS.FACEPHOTO },
  ]

  const isEnabled = (name) => res[`${name}VerificationActive`]
  const getThreshold = (name) => res[`${name}VerificationThreshold`]
  const hasLimitSet = (name) => !_.isNil(getThreshold(name))

  const filterEnabled = _.filter(({ name }) => isEnabled(name) && hasLimitSet(name))
  const mapToTrigger = _.map(({ id, name }) => newTrigger({ threshold: getThreshold(name), requirement: id }))

  return _.compose(mapToTrigger, filterEnabled)(requirements)
}

module.exports = Trader
