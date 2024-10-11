'use strict'

const EventEmitter = require('events').EventEmitter
const qs = require('querystring')
const util = require('util')
const uuid = require('uuid')
const _ = require('lodash/fp')

const BN = require('./bn')
const E = require('./error')

const version = require('../package.json').version

const request = require('./request')
const logs = require('./logs')
const { gql, GraphQLClient } = require('./graphql-client')
const lssettings = require('./db/lssettings')

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
        cryptoCodeDisplay
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
      customerAuthentication

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
        deviceName
        numberOfCassettes
        numberOfRecyclers
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
        externalService
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
          name
          count
          denomination
        }
        virtual
      }

      recyclers {
        physical {
          name
          count
          denomination
          number
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
      emptyUnit
      refillUnit
      diagnostics
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

let networkDownCount = 0
let epipeLog = null
let epipePoll = null
const pid = uuid.v4()

const Trader = function (clientCert, connectionInfo, dataPath, relayedModel) {
  if (!(this instanceof Trader)) return new Trader(clientCert, connectionInfo, dataPath, relayedModel)
  EventEmitter.call(this)

  this.globalOptions = {
    connectionInfo,
    clientCert
  }

  const model = relayedModel ? relayedModel : 'unknown'
  this.gqlClient = GraphQLClient(connectionInfo.host, PORT, { model, pid, version })

  this.model = model
  this.state = { state: 'initial', isIdle: false }
  this.configVersion = null
  this.latestConfigVersion = null
  this.dispenseIntervalPointer = null
  this.terms = { active: false }
  this.termsHash = null
  this.dataPath = dataPath
  this.operatorInfo = { active: false }
  this.areThereAvailablePromoCodes = null
  this.timezone = null
  this.urlsToPing = []
  this.speedtestFiles = []
  this.staticCoins = []
  this.coins = []
  this.triggers = []
  this.triggersAutomation = {}
  this.machineInfo = {}

  // Start logs sync
  setInterval(this.syncLogs.bind(this), LOGS_SYNC_INTERVAL)
  this.syncLogs()
}
util.inherits(Trader, EventEmitter)

Trader.prototype.request = function (options) {
  return request(this.configVersion, this.globalOptions, options)
}

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
  if (this.isUnauthorized(err)) return this.emit('unpair')

  // Ignore request timeout and forced timeout
  if ((err.code && err.code === 'ETIMEDOUT') || err.statusCode === 408) return
  if (this.state.state !== 'networkDown') console.log('Sync logs error:', err)
}

Trader.prototype.clearConfigVersion = function clearConfigVersion () {
  this.configVersion = null
  return Promise.resolve(true)
}

Trader.prototype.setConfigVersion = function setConfigVersion () {
  if (!this.latestConfigVersion) throw new Error('We don\'t have a configVersion')
  this.configVersion = this.latestConfigVersion
}

Trader.prototype.verifyUser = function verifyUser (idRec) {
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

Trader.prototype.poll = function poll () {
  return this.gqlClient.query({
    query: GRAPHQL_QUERY,
    variables: {
      configVersion: this.latestConfigVersion,
      currentHash: this.termsHash,
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

        console.log(`Encountered ${errorType} error, txId: ${tx.id}`)
        if (errorType === 'stale') throw new E.StaleError('Stale error')
        throw new E.RatchetError('Ratchet error')
      }

      if (err.statusCode >= 500) throw err
      if (this.isNetworkError(err)) return
      throw err
    })
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

Trader.prototype.emailCode = function emailCode (email) {
  return this.request({
    path: `/customer/email_code?version=${version}`,
    method: 'POST',
    body: { email }
  })
    .then(r => r.body)
    .catch(err => {
      if (err && err.statusCode === 401) {
        const badEmailErr = new Error('Bad email')
        badEmailErr.name = 'BadEmailError'
        throw badEmailErr
      }

      throw err
    })
}

Trader.prototype.phoneCode = function phoneCode (phone) {
  return this.request({
    path: `/customer/phone_code?version=${version}`,
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

Trader.prototype.fetchEmailTx = function fetchEmailTx (email) {
  return this.request({
    path: '/tx?' + qs.stringify({ email }),
    method: 'GET'
  })
    .then(r => massage(r.body))
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

Trader.prototype.getExternalCompliance = function getExternalCompliance (customerId, triggerId, isRetry) {
  return this.request({
    path: `/customer/external?customer=${customerId}&trigger=${triggerId}&isRetry=${isRetry}`,
    method: 'get'
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

const addCustomInfoRequestIdToTriggers = triggers =>
  triggers.map(t => Object.assign(t, { customInfoRequestId: t.customInfoRequest?.id ?? '' }))

Trader.prototype.saveConfig = function saveConfig (staticConfigChanged, termsChanged) {
  if (!staticConfigChanged && !termsChanged) return Promise.resolve()

  if (!staticConfigChanged)
    return lssettings.saveTerms(this.termsHash, this.terms)

  return lssettings.saveConfig({
    coins: this.staticCoins.map(_.mapValues(v => v.toString())),
    locales: {
      country: this.locale.country,
      fiat_code: this.locale.fiatCode,
      primary_locale: this.locale.localeInfo.primaryLocale,
      locales: this.locale.localeInfo.primaryLocales,
    },
    machineInfo: this.machineInfo,
    operatorInfo: this.operatorInfo.active ? this.operatorInfo : null,
    receiptOptions: this.receiptOptions,
    speedtestFiles: this.speedtestFiles,
    staticConfig: {
      version: this.latestConfigVersion,
      enable_paper_wallet_only: this.enablePaperWalletOnly,
      has_lightening: this.hasLightning,
      server_version: this.serverVersion,
      timezone: this.timezone,
      two_way_mode: this.twoWayMode,
      customer_authentication: this.customerAuthentication,
      paper_receipt: this.receiptPrintingActive,
      sms_receipt: this.smsReceiptActive,
    },
    terms: this.terms,
    termsHash: this.termsHash,
    triggers: this.triggers,
    triggersAutomation: this.triggersAutomation,
    urlsToPing: this.urlsToPing,
  }).catch(err => console.log("Failed saving lssettings:", err))
}

Trader.prototype.pollHandler = function pollHandler (data) {
  const handleStaticConfig = data => {
    /* If the config is up to date, there's nothing to do */
    if (!data) return Promise.resolve(false)

    this.latestConfigVersion = data.configVersion
    this.serverVersion = data.serverVersion
    this.timezone = data.timezone
    this.hasLightning = data.hasLightning
    this.machineInfo = data.machineInfo
    this.urlsToPing = data.urlsToPing
    this.speedtestFiles = data.speedtestFiles
    this.enablePaperWalletOnly = data.enablePaperWalletOnly
    this.twoWayMode = data.twoWayMode
    this.customerAuthentication = data.customerAuthentication
    this.triggersAutomation = Object.assign(
      _.omit(['custom', '__typename'], data.triggersAutomation),
      (data.triggersAutomation.custom || []).reduce(
        (acc, { id, type }) => Object.assign(acc, { [id]: type }),
        {}
      )
    )
    this.triggers = addCustomInfoRequestIdToTriggers(data.triggers)

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

    this.staticCoins = _.map(_.mapValues(toBN), data.coins)

    this.operatorInfo = data.operatorInfo ?
      _.flow(
        _.pick(['name', 'phone', 'email', 'website', 'companyNumber']),
        _.set('active', true)
      )(data.operatorInfo) :
      { active: false }

    return Promise.resolve(true)
  }

  const handleDynamicConfig = data => {
    this.areThereAvailablePromoCodes = data.areThereAvailablePromoCodes

    const coins = _.flow(
      _.get('coins'),
      _.map(coin => [coin.cryptoCode, _.omit(['cryptoCode'], coin)]),
      _.fromPairs
    )(data)

    if (data.cassettes) {
      this.originalCassettes = _(data.cassettes.physical)
        .map(_.update('denomination', BN))
        .value()
      this.cassettes = _(data.cassettes.physical)
        .orderBy(['denomination'], ['asc'])
        .map(_.update('denomination', BN))
        .value()
      this.virtualCassettes = _.map(BN, data.cassettes.virtual)
    } else {
      this.originalCassettes = []
      this.cassettes = []
      this.virtualCassettes = []
    }

    if (data.recyclers) {
      this.originalRecyclers = _(data.recyclers.physical)
        .map(_.update('denomination', BN))
        .value()
      this.recyclers = _(data.recyclers.physical)
        .orderBy(['denomination'], ['asc'])
        .map(_.update('denomination', BN))
        .value()
      this.virtualRecyclers = _.map(BN, data.recyclers.virtual)
    } else {
      this.originalRecyclers = []
      this.recyclers = []
      this.virtualRecyclers = []
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

    this.coins = _.flow(
      _.map(coin => _.set('rates', _.pick(['ask', 'bid'], coins[coin.cryptoCode]), coin)),
      _.filter(coin => isActiveCoin(this._rates, this.balances, coin.cryptoCode))
    )(this.staticCoins)
    this.zeroConfLimits = _.mapValues(_.get('zeroConfLimit'), coins)
    return Promise.resolve()
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
    let termsChanged = false

    if (!terms || !terms.hash) { // T&C don't exist or were removed/disabled
      this.terms = _.set('active', false, this.terms)
      return Promise.resolve(true)
    }

    let details = this.terms

    // configVersion has increased; have to update title, delay, accept, &c
    if (terms.details) {
      termsChanged = true
      details = _.assign(details, terms.details)
    }

    if (terms.hash !== this.termsHash) { // T&C changed
      if (!terms.text) { // Shouldn't happen
        this.terms = { active: false }
        this.termsHash = null
        return Promise.resolve(true)
      }

      termsChanged = true
      details = _.set('text', terms.text, details)
    }

    if (termsChanged) {
      this.terms = _.flow(
        _.pick(['delay', 'title', 'text', 'accept', 'cancel', 'tcPhoto']),
        _.set('active', true)
      )(details)
      this.termsHash = terms.hash
    }

    return Promise.resolve(termsChanged)
  }

  return Promise.all([
    handleStaticConfig(data.configs.static),
    handleTerms(data.terms),
  ])
  .then(([staticConfigChanged, termsChanged]) => this.saveConfig(staticConfigChanged, termsChanged))
  .then(() => handleDynamicConfig(data.configs.dynamic))
  .then(() => {
    /* Post-poll events */
    networkDownCount = 0
    if (_.isEmpty(this.coins)) return this.emit('networkDown');
    [
      'reboot',
      'shutdown',
      'restartServices',
      'emptyUnit',
      'refillUnit',
      'diagnostics'
    ].forEach(evname => { if (data.configs.dynamic[evname]) this.emit(evname) })
    this.emit('pollUpdate', isNewState(this))
    this.emit('networkUp')
  })
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

Trader.prototype.emptyUnit = function emptyUnit (body) {
  return this.request({
    path: '/units/empty',
    body,
    method: 'POST'
  })
  .catch(err => console.error('Error when updating counts after emptying the unit', err))
}

Trader.prototype.refillUnit = function refillUnit (body) {
  return this.request({
    path: '/units/refill',
    body,
    method: 'POST'
  })
  .catch(err => console.error('Error when updating counts after refilling the unit', err))
}

Trader.prototype.diagnosticPhotos = function diagnosticPhotos (body) {
  return this.request({
    path: '/diagnostics',
    body,
    method: 'POST'
  })
    .catch(err => console.error('Error when updating counts after emptying the unit', err))
}

Trader.prototype.failedQRScans = function failedQRScans (frames) {
  return this.request({
    path: '/failedqrscans',
    body: frames,
    method: 'POST'
  })
    .catch(err => console.error('Error when updating counts after emptying the unit', err))
}

Trader.prototype.loadConfigsFromDB = function loadConfigsFromDB () {
  const loadStaticConfig = ({
    version,
    enable_paper_wallet_only,
    has_lightening,
    server_version,
    two_way_mode,
    paper_receipt,
    sms_receipt,
  }) => {
    this.latestConfigVersion = version
    this.enablePaperWalletOnly = enable_paper_wallet_only
    this.hasLightning = has_lightening
    this.serverVersion = server_version
    this.twoWayMode = two_way_mode

    this.receiptPrintingActive = paper_receipt
    this.smsReceiptActive = sms_receipt
  }

  const loadLocales = ({ country, fiat_code, primary_locale }, primaryLocales) => {
    this.locale = {
      country,
      fiatCode: fiat_code,
      localeInfo: {
        primaryLocale: primary_locale,
        primaryLocales,
      },
    }
  }

  const loadTerms = ([hash, terms]) => {
    this.termsHash = hash
    this.terms = terms
  }

  return lssettings.loadConfig()
    .then(config => {
      if (config === null)
        return console.log("No previous config saved in lssettings")
      const {
        coins,
        locales,
        operatorInfo,
        receiptOptions,
        speedtestFiles,
        staticConfig,
        terms,
        triggersAutomation,
        triggers,
        urlsToPing,
      } = config

      loadStaticConfig(staticConfig)
      loadLocales(staticConfig, locales)
      loadTerms(terms)
      this.triggers = addCustomInfoRequestIdToTriggers(triggers)

      // Incomplete, includes only static config values. Used as a starting
      // point merging with dynamic config.
      this.staticCoins = _.map(_.mapValues(toBN), coins)

      this.operatorInfo = operatorInfo
      this.receiptOptions = receiptOptions
      this.speedtestFiles = speedtestFiles
      this.triggersAutomation = triggersAutomation
      this.urlsToPing = urlsToPing
    })
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

module.exports = Trader
