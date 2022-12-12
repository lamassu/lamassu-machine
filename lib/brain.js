const fs = require('fs')
const cp = require('child_process')
const os = require('os')
const path = require('path')
const net = require('net')
const semver = require('semver')
const _ = require('lodash/fp')
const minimist = require('minimist')
const Rx = require('rxjs/Rx')
const pify = require('pify')
const pDelay = require('delay')
const pAny = require('p-any')
const pSettle = require('p-settle')
const { utils: coinUtils } = require('@lamassu/coins')

const uuid4 = require('@fczbkk/uuid4');
const commandLine = minimist(process.argv.slice(2))

const operatorInfo = require('./operator-info')
const sms = require('./compliance/flows/sms')
const pairing = require('./pairing')
const Tx = require('./tx')
const BN = require('./bn')
const usbreset = require('./usbreset')
const version = require('../package.json').version
const db = require('./db')
const actionEmitter = require('./action-emitter')
const optimizeDispense = require('./dispense-optimizer')
const ping = require('./ping')
const { setVariableInterval, clearVariableInterval } = require('./variable-interval.js')

const deviceConfig = require('../device_config.json')

const boardManager = pickBoardManager()

const E = require('./error')
const complianceTiers = require('./compliance/compliance-tiers')
const idCardData = require('./compliance/flows/id-card-data')
const idCardPhoto = require('./compliance/flows/id-card-photo')
const facephoto = require('./compliance/flows/facephoto')
const sanctions = require('./compliance/flows/sanctions')
const usSsn = require('./compliance/flows/US-SSN')
const customTier = require('./compliance/flows/custom-info-request')

const { getLowestAmountPerRequirement, getAmountToHardLimit, getTriggered } = require('./compliance/triggers/triggers')
const { ORDERED_REQUIREMENTS, REQUIREMENTS } = require('./compliance/triggers/consts')

const printerLoader = require('./printer/loader')
const BigNumber = BN.klass

let transitionTime

const AUTOMATABLE_REQUIREMENTS = ['idCardData', 'sanctions', 'idCardPhoto', 'facephoto', 'usSSn']
const COMPLIANCE_VERIFICATION_STATES = ['smsVerification', 'permission_id', 'permission_face_photo', 'usSsnPermission', 'customInfoRequestPermission']
const COMPLIANCE_REJECTED_STATES = ['registerUsSsn', 'inputCustomInfoRequest']
const BILL_ACCEPTING_STATES = ['billInserted', 'billRead', 'acceptingBills',
  'acceptingFirstBill', 'maintenance']
const NON_TX_STATES = ['networkDown', 'connecting', 'wifiConnected', 'pairing',
  'initializing', 'booting']
const ARE_YOU_SURE_ACTIONS = ['cancelTransaction', 'continueTransaction']
const ARE_YOU_SURE_HANDLED = ['depositCancel']
const ARE_YOU_SURE_SMS_HANDLED = ['cancelPhoneNumber', 'cancelSecurityCode']
const ARE_YOU_SURE_HANDLED_SMS_COMPLIANCE = ['deposit_timeout', 'rejected_zero_conf']
const INITIAL_STATE = 'start'
const MIN_SCREEN_TIME = 1000
const ACTIVE_POLL_INTERVAL = commandLine.pollTime || 5000
const IDLE_POLL_INTERVAL = 60 * 1000
const INSUFFICIENT_FUNDS_CODE = 570
const NETWORK_TIMEOUT_INTERVAL = 20000
const MIN_WAITING = 500
const STATUS_QUERY_TIMEOUT = 2000
const DEFAULT_NUMBER_OF_CASSETTES = 2
const TRIGGER_AUTOMATION = {
  AUTOMATIC: 'Automatic',
  MANUAL: 'Manual'
}

const Brain = function (config) {
  if (!(this instanceof Brain)) return new Brain(config)

  this.rootConfig = config
  this.config = config.brain

  this.devBoard = config.devBoard

  this.bootTime = Date.now()

  this.dataPath = path.resolve(__dirname, '..', this.config.dataPath)
  this.certPath = {
    cert: path.resolve(this.dataPath, this.config.certs.certFile),
    key: path.resolve(this.dataPath, this.config.certs.keyFile)
  }

  this.connectionInfoPath = path.resolve(this.dataPath, 'connection_info.json')
  this.dbRoot = path.resolve(this.dataPath, 'tx-db')

  const wifiConfig = config.wifi
  wifiConfig.wpaConfigPath = wifiConfig.wpaConfigPath &&
  path.resolve(this.dataPath, wifiConfig.wpaConfigPath)
  if (config.mockWifi) {
    this.wifi = require('./mocks/wifi')(wifiConfig)
  } else if (config.wifiDisabled) {
    this.wifi = require('./wifi-none')()
  } else {
    this.wifi = require('./wifi')(wifiConfig)
  }

  this.scanner = config.mockCam
    ? require('./mocks/scanner')
    : require('./scanner')
  this.scanner.config(config)

  config.billValidator.rs232.device = determineDevicePath(config.billValidator.rs232.device)
  if (config.billDispenser) {
    config.billDispenser.device = determineDevicePath(config.billDispenser.device)
  }

  this.billValidator = this.loadBillValidator()

  printerLoader.load().then(printer => {
    this.printer = printer
  }).catch(console.log)

  this.setBrowser(require('./browser')())
  this._setState(INITIAL_STATE)
  this.tx = null
  this.permissionsGiven = {}
  this.requirementAmountTriggered = {}
  this.pk = null
  this.currentScreenTimeout = null
  this.locked = true
  this.wifis = null
  this.screenTimeout = null
  this.lastPowerUp = Date.now()
  this.networkDown = true
  this.hasConnected = false
  this.localeInfo = this.config.locale.localeInfo
  this.dirtyScreen = false
  this.billValidatorErrorFlag = false
  this.startDisabled = false
  this.testModeOn = false
  this.uiCassettes = null
  this.powerDown = false
  this.beforeIdleState = true
  this.scannerTimeout = null
  this.manualTriggersDataProvided = _.zipObject(AUTOMATABLE_REQUIREMENTS, Array(AUTOMATABLE_REQUIREMENTS.length).fill(false))
  this.txBlockedByManualTrigger = false
  this.termsAcceptButtonPressed = false

  this.numberOfCassettes = _.isFinite(parseInt(deviceConfig.billDispenser.cassettes))
    ? deviceConfig.billDispenser.cassettes
    : DEFAULT_NUMBER_OF_CASSETTES
}

const EventEmitter = require('events').EventEmitter
const util = require('util')
util.inherits(Brain, EventEmitter)

function osPlatform () {
  switch (os.platform()) {
    case 'darwin': return 'MacOS'
    case 'linux': return 'Linux'
    case 'win32': return 'Windows'
    default: return 'Unknown'
  }
}

Brain.prototype.determinePlatform = function determinePlatform () {
  if (fs.existsSync('/etc/inittab')) return 'N7G1'
  if (fs.existsSync('/etc/init/lamassu-machine.conf')) return 'AAEON'
  return 'SSUBOARD'
}

function platformDisplay (code) {
  if (code === 'N7G1') return 'Trofa'
  if (code === 'AAEON') return 'Douro'
  return osPlatform()
}

Brain.prototype.checkDownloadSpeed = function checkDownloadSpeed (files) {
  ping.checkDownloadSpeed(files)
    .then(res => {
      if (!res) return
      const filteredResults = _.filter(x => {
        if (_.isNil(x.speed)) return false
        return _.isFinite(_.toNumber(x.speed))
      })(res)
      if (_.isEmpty(filteredResults)) return
      this.trader.networkPerformance(filteredResults)
    })
    .catch(console.error)
}

Brain.prototype.networkHeartbeat = function networkHeartbeat (urls) {
  ping.pingRepository(urls)
    .then(res => {
      if (!res) return
      const filteredResults = _.filter(x => x.isAlive)(res)
      if (_.isEmpty(filteredResults)) return
      this.trader.networkHeartbeat(filteredResults)
    })
    .catch(console.error)
}

Brain.prototype.initNetworkMeasurements = function initNetworkMeasurements () {
  this.networkHeartbeat(this.trader.urlsToPing)
  this.checkDownloadSpeed(this.trader.speedtestFiles)

  this.pingInterval = setInterval(() => {
    return this.networkHeartbeat(this.trader.urlsToPing)
  }, this.config.pingInterval)

  this.speedtestInterval = setInterval(() => {
    return this.checkDownloadSpeed(this.trader.speedtestFiles)
  }, this.config.speedtestInterval)
}

Brain.prototype.traderRun = function traderRun () {
  /*
   * TODO: Once the old poller is thrown away I believe we can change to a
   * "native" GraphQL polling mechanism.
   */
  this.pollHandle = setVariableInterval(() => {
      if (this.state === 'networkDown') this.trader.clearConfigVersion()
      return this.trader.poll()
    },
    ACTIVE_POLL_INTERVAL,
    res => res ? ACTIVE_POLL_INTERVAL : IDLE_POLL_INTERVAL
  )

  this.networkHeartbeat()
  this.checkDownloadSpeed()

  this.pingInterval = setInterval(() => {
    return this.networkHeartbeat()
  }, this.config.pingInterval)

  this.speedtestInterval = setInterval(() => {
    return this.checkDownloadSpeed()
  }, this.config.speedtestInterval)

  return this.trader.poll()
}

Brain.prototype.stop = function stop () {
  clearVariableInterval(this.pollHandle)
  clearInterval(this.pingInterval)
  clearInterval(this.speedtestInterval)
}

Brain.prototype.prunePending = function prunePending (txs) {
  const pendingTxs = _.filter('dirty', txs)

  if (_.isEmpty(pendingTxs)) return 0

  const modifier = tx => tx.direction === 'cashIn'
    ? Tx.update(tx, { send: true, timedout: true })
    : Tx.update(tx, { timedout: true })

  const postTx = tx => {
    return this.postTx(modifier(tx))
      .catch(err => {
        if (err instanceof E.RatchetError) return
        if (err instanceof E.StaleError) return
        throw err
      })
  }

  // Since it's pending we want to send and not wait for more bills
  const promises = _.map(postTx, pendingTxs)

  return Promise.all(promises)
    .then(() => pendingTxs.length)
}

Brain.prototype.selectBillValidatorClass = function selectBillValidatorClass () {
  if (commandLine.mockBillValidator) return require('./mocks/id003')

  if (this.rootConfig.billValidator.deviceType === 'cashflowSc') {
    return require('./mei/cashflow_sc')
  }

  if (this.rootConfig.billValidator.deviceType === 'ccnet') {
    return require('./ccnet/ccnet')
  }

  return require('./id003/id003')
}

Brain.prototype.loadBillValidator = function loadBillValidator () {
  const billValidatorClass = this.selectBillValidatorClass()
  return billValidatorClass.factory(this.rootConfig.billValidator)
}

Brain.prototype.processPending = function processPending () {
  console.log('Processing pending txs...')
  return db.prune(this.dbRoot, txs => this.prunePending(txs))
    .catch(err => console.log(err.stack))
}

Brain.prototype.run = function run () {
  console.log('crypto Machine software initialized.')
  const self = this
  this._init()
  boardManager.run()
  this.browser().listen(this.config.wsHost, this.config.wsPort)
  if (!this.devBoard) this.setupHardware()
  usbreset.reset(this.config.resetBasePath, this.determinePlatform())
  this._periodicLog()

  const callback = function () {
    self._transitionState('restart')
    console.log('Scheduled restart after idle time.')
    process.exit()
  }

  this.hasFrontFacingCamera = this.scanner.hasCamera('facephoto')
  if (!this.hasFrontFacingCamera) console.log('Warning: no front facing camera detected.')

  this._executeCallbackAfterASufficientIdlePeriod(callback)

  this.clientCert = pairing.getCert(this.certPath)

  if (!this.clientCert) {
    return this._transitionState('virgin', { version })
  }

  return this.checkWifiStatus()
}

Brain.prototype.epipeLogs = function epipeLogs () {
  if (this.trader) {
    this.trader.epipeLogs()
  }
}

Brain.prototype._executeCallbackAfterASufficientIdlePeriod =
function _executeCallbackAfterASufficientIdlePeriod (callback) {
  const self = this
  const config = this.config
  const exitTime = config.exitTime
  const exitOnIdle = exitTime + config.idleTime

  setInterval(function () {
    if (self.isStaticState()) {
      const date = new Date()
      const elapsed = (date.getTime()) - self.bootTime
      if (exitOnIdle && elapsed > exitOnIdle) {
        callback()
      }
    }
  }, this.config.checkIdle)
}

Brain.prototype._periodicLog = function _periodicLog () {
  const self = this
  const batteryCapacityPath = this.config.batteryCapacityPath
  const tempSensorPath = this.config.tempSensorPath
  const readFile = pify(fs.readFile)
  const tempSensorPaths = _.compact(_.castArray(tempSensorPath))
  const batteryCapacityPaths = _.compact(_.castArray(batteryCapacityPath))
  const machine = this.rootConfig.cryptomatModel

  function reporting () {
    const clauses = ['machine: %s, version: %s, cpuLoad: %s, memUse: %s, memFree: %s\n  nodeUptime: %s, ' +
    'osUptime: %s']

    const batteryPromises = _.map(path => readFile(path, { encoding: 'utf8' }), batteryCapacityPaths)
    const tempPromises = _.map(path => readFile(path, { encoding: 'utf8' }), tempSensorPaths)
    const tempReading = pAny(tempPromises)
    const batteryReading = pAny(batteryPromises)

    return pSettle([tempReading, batteryReading])
      .then(([temperature, battery]) => {
        if (battery.value) {
          clauses.push('battery: ' + battery.value.trim() + '%')
        }

        if (temperature.value) {
          clauses.push('CPU temperature: ' + (temperature.value.trim() / 1000) + '° C')
        }

        const cpuLoad = os.loadavg()[1].toFixed(2)
        const memUse = (process.memoryUsage().rss / Math.pow(1000, 2)).toFixed(1) +
      ' MB'
        const memFree = (os.freemem() * 100 / os.totalmem()).toFixed(1) + '%'
        const nodeUptimeMs = Date.now() - self.bootTime
        const nodeUptime = (nodeUptimeMs / 3600000).toFixed(2) + 'h'
        const osUptime = (os.uptime() / 3600).toFixed(2) + 'h'
        const format = clauses.join(', ')
        console.log(format, machine, version, cpuLoad, memUse, memFree, nodeUptime, osUptime)
      })
  }
  reporting()
  setInterval(reporting, this.config.periodicLogInterval)
}

Brain.prototype.initialize = function initialize () {
  this.clientCert = pairing.getCert(this.certPath)

  if (!this.clientCert) this._transitionState('initializing')

  pairing.init(this.certPath)
    .then(clientCert => {
      this.clientCert = clientCert
      this.checkWifiStatus()
    })
}

Brain.prototype.checkWifiStatus = function checkWifiStatus () {
  const self = this

  this._transitionState('booting')

  this.wifi.status(function (err, status, ip) {
    if (err || status === 'pending') {
      if (err) console.log(err.stack)
      if (self.state !== 'wifiConnecting') {
        self._wifiConnecting()
      }

      self.wifi.waitConnection(function (err, ip) {
        if (err) {
          self.wifi.startScanning()
          self._wifiList()
          return
        }
        self.config.ip = ip
        self._wifiConnected()
      })

      return
    }

    if (status === 'disconnected') {
      self.wifi.startScanning()
      self._wifiList()
      return
    }

    if (status === 'connected') {
      self.config.ip = ip
      self._wifiConnected()
    }
  })
}

Brain.prototype._init = function init () {
  this._initHearbeat()
  this._initWifiEvents()
  this._initBrowserEvents()
  this._initBillValidatorEvents()
  this._initBrainEvents()
  this._initActionEvents()
}

Brain.prototype._initHearbeat = function _initHeartbeat () {
  let pingIntervalPtr

  const heartbeatServer = net.createServer(function (c) {
    console.log('heartbeat client connected')
    c.on('end', function () {
      clearInterval(pingIntervalPtr)
      console.log('heartbeat client disconnected')
    })

    c.on('error', function (err) {
      console.log('hearbeat server error: %s', err)
    })

    pingIntervalPtr = setInterval(function () {
      c.write('ping')
    }, 5000)
  })

  try { fs.unlinkSync('/tmp/heartbeat.sock') } catch (ex) {}
  heartbeatServer.listen('/tmp/heartbeat.sock', function () {
    console.log('server bound')
  })
}

Brain.prototype._initWifiEvents = function _initWifiEvents () {
  const self = this

  this.wifi.on('scan', function (res) {
    self.wifis = res
    self.browser().send({ wifiList: res })
  })

  this.wifi.on('connected', function () {
    if (self.state === 'wifiList') {
      self.wifi.stopScanning()
      self._wifiConnected()
    }
  })
}

Brain.prototype._initTraderEvents = function _initTraderEvents () {
  const self = this
  this.trader.on('pollUpdate', needsRefresh => this._pollUpdate(needsRefresh))
  this.trader.on('networkDown', function () { self._networkDown() })
  this.trader.on('networkUp', function () { self._networkUp() })
  this.trader.on('error', function (err) { console.log(err.stack) })
  this.trader.on('unpair', function () { self._unpair() })
  this.trader.on('reboot', function () { self._reboot() })
  this.trader.on('shutdown', function () { self._shutdown() })
  this.trader.on('restartServices', function () { self._restartServices('Remote restart services', true) })
}

Brain.prototype._initBrowserEvents = function _initBrowserEvents () {
  const self = this
  const browser = this.browser()

  browser.on('connected', function () { self._connectedBrowser() })
  browser.on('message', function (req) { self._processRequest(req) })
  browser.on('closed', function () { self._closedBrowser() })
  browser.on('messageError', function (err) {
    console.log('Browser error: ' + err.message)
  })
  browser.on('error', function (err) {
    console.log('Browser connect error: ' + err.message)
    console.log('Likely that two instances are running.')
  })
}

Brain.prototype._initBillValidatorEvents = function _initBillValidatorEvents () {
  const self = this
  const billValidator = this.billValidator

  billValidator.on('error', function (err) { self._billValidatorErr(err) })
  billValidator.on('disconnected', function () { self._billValidatorErr() })
  billValidator.on('billAccepted', function () { self._billInserted() })
  billValidator.on('billRead', function (data) { self._billRead(data) })
  billValidator.on('billValid', function () { self.updateBillScreen() })
  billValidator.on('billRejected', function () { self._billRejected() })
  billValidator.on('timeout', function () { self._billTimeout() })
  billValidator.on('standby', function () { self._billStandby() })
  billValidator.on('jam', function () { self._billJam() })
  billValidator.on('stackerOpen', function () { self._stackerOpen() })
  billValidator.on('enabled', function (data) { self._billsEnabled(data) })
}

Brain.prototype._initBrainEvents = function _initBrainEvents () {
  this.on('newState', function (state) {
    console.log('new brain state:', state)
  })
}

Brain.prototype._initActionEvents = function _initActionEvents () {
  actionEmitter.on('action', (...args) => this.processAction.apply(this, args))
  actionEmitter.on('brain', (...args) => this.processBrainAction.apply(this, args))
}

Brain.prototype.oldScanBayLightOn = function oldScanBayLightOn () {
  if (this.hasNewScanBay()) return
  this.billValidator.lightOn()
}

Brain.prototype.oldScanBayLightOff = function oldScanBayLightOff () {
  if (this.hasNewScanBay()) return
  this.billValidator.lightOff()
}

Brain.prototype.processBrainAction = function processBrainAction (action) {
  switch (action.action) {
    case 'scanBayLightOn': return this.oldScanBayLightOn()
    case 'scanBayLightOff': return this.oldScanBayLightOff()
  }
}

Brain.prototype.processAction = function processAction (action, stateMachine) {
  switch (action) {
    // idCardData actions
    case 'scanPDF':
      this.scanPDF()
      break
    case 'authorizeIdCardData':
      this.authorizeIdCardData()
      break
    // idCardPhoto actions
    case 'scanPhotoCard':
      this.scanPhotoCard()
      break
    case 'authorizePhotoCardData':
      this.authorizePhotoCardData()
      break
    // facephoto actions
    case 'retryTakeFacephoto':
    case 'takeFacephoto':
      this.takeFacephoto()
      break
    case 'authorizeFacephotoData':
      this.authorizeFacephotoData()
      break
    // generic actions
    case 'timeoutToScannerCancel':
      this.timeoutToScannerCancel(stateMachine)
      break
    case 'transitionScreen':
      this.transitionScreen()
      break
    case 'timeoutToFail':
      setTimeout(() => stateMachine.dispatch('FAIL'), _.get('scanner.timeout', this.rootConfig))
      break
    case 'success':
      this.smsFlowHandleReturnState()
      break
    case 'failure':
      this.failedCompliance = stateMachine.key
      this.failedComplianceValue = this.requirementAmountTriggered[this.failedCompliance]
      this.smsFlowHandleReturnState()
      break
    // sanctions
    case 'triggerSanctions':
      this.triggerSanctions()
      break
    case 'sanctionsFailure':
      this._timedState('sanctionsFailure')
      break
    // suspend
    case 'triggerSuspend':
      this.triggerSuspend()
      break
    // block
    case 'triggerBlock':
      this.triggerBlock()
      break
    // us ssn
    case 'saveUsSsn':
      this.saveUsSsn()
      break
    // custom info request data saving
    case 'saveCustomInfoRequestData':
      this.saveCustomInfoRequestData()
      break
  }
}

Brain.prototype.transitionScreen = function transitionScreen () {
  let appState = null

  // check idCardData state
  let machineState = idCardData.getState()
  switch (machineState) {
    case 'scanId':
      appState = 'scan_id_data'
      break
    case 'authorizing':
      appState = 'verifying_id_data'
      break
    case 'idScanFailed':
      appState = 'failed_scan_id_data'
      break
    case 'idVerificationFailed':
      appState = 'failed_permission_id'
      break
  }

  if (!appState) {
    // otherwise check idCardPhoto state
    machineState = idCardPhoto.getState()
    switch (machineState) {
      case 'scanPhotoCard':
        appState = 'scan_id_photo'
        break
      case 'scanPhotoCardManual':
        appState = 'scan_manual_id_photo'
        break
      case 'authorizing':
        appState = 'verifying_id_photo'
        break
      case 'photoCardScanFailed':
        appState = 'failed_scan_id_photo'
        break
      case 'photoCardVerificationFailed':
        appState = 'failed_verifying_id_photo'
        break
    }
  }

  if (!appState) {
    // otherwise check facephoto state
    machineState = facephoto.getState()
    switch (machineState) {
      case 'takeFacephoto':
        appState = 'scan_face_photo'
        break
      case 'retryTakeFacephoto':
        appState = 'retry_scan_face_photo'
        break
      case 'authorizing':
        appState = 'verifying_face_photo'
        break
      case 'facephotoFailed':
        appState = 'failed_scan_face_photo'
        break
      case 'facephotoVerificationFailed':
        appState = 'failed_permission_id'
        break
    }

    if (!appState) {
      // sanctions state
      machineState = sanctions.getState()
      switch (machineState) {
        case 'triggerSanctions':
          appState = 'waiting'
          break
      }
    }

    if (!appState) {
      // usSsn state
      machineState = usSsn.getState()
      switch (machineState) {
        case 'askForSsn':
          appState = 'registerUsSsn'
          break
        case 'authorizing':
          appState = 'waiting'
          break
      }
    }

    if (!appState) {
      // custom info request state
      machineState = customTier.getState()
      switch (machineState) {
        case 'askForCustomInfoRequest':
          appState = 'inputCustomInfoRequest'
          break
        case 'saveData':
          appState = 'waiting'
          break
      }
    }
  }

  if (!appState) { return }
  const customInfoRequest = appState === 'inputCustomInfoRequest'
    ? {
      customInfoRequest: _.get('customInfoRequest.customRequest')(_.find(trigger => trigger.customInfoRequestId === this.customInfoRequestId)(this.triggers))
    }
    : null
  this._transitionState(appState, _.assign(customInfoRequest, { context: 'compliance' }))
}

Brain.prototype.clearTimeoutToScannerCancel = function clearTimeoutToScannerCancel () {
  if (!this.scannerTimeout) { return }

  clearTimeout(this.scannerTimeout)
  this.scannerTimeout = null
}

Brain.prototype.timeoutToScannerCancel = function timeoutToScannerCancel (stateMachine) {
  this.clearTimeoutToScannerCancel()
  this.scannerTimeout = setTimeout(() => {
    this.scanner.cancel()
    stateMachine.dispatch('SCAN_ERROR')
  }, _.get('scanner.timeout', this.rootConfig))
}

Brain.prototype.idCardStillsCallback = function idCardStillsCallback (photo) {
  idCardData.addIdDataPhoto(photo.toString('base64'))
}

Brain.prototype.scanPDF = function scanPDF () {
  const customer = this.customer
  this.scanBayLightOn()
  this.scanner.scanPDF417((err, result) => {
    this.scanBayLightOff()
    this.startDisabled = false

    if (err || !result) {
      const photos = idCardData.getIdDataPhotos()
      this.trader.updateIdCardPhotos(customer.id, { photos })
        .then(() => console.log('Successfully saved ', photos.length, ' id data photos'))
        .catch(err => {
          console.log('Error saving id card photos', err)
        })
    }

    if (err) {
      console.log(err)
      return idCardData.dispatch('SCAN_ERROR')
    }

    if (!result) {
      console.log('No PDF417 result')
      return
    }

    if (this.hasExpired(result)) {
      console.log('Expired ID card')
      return idCardData.dispatch('SCAN_ERROR')
    }

    idCardData.setData(result)
    this.setManualTrigger('idCardData')
    return idCardData.dispatch('SCANNED')
  }, this.idCardStillsCallback)
}

Brain.prototype.hasExpired = function hasExpired (cardData) {
  // TODO: ZA cards currently do not have an expiration date to confirm against
  if (cardData.country === 'ZA') return false

  // In case the expiration date field is not found. Prevents l-m from bailing
  if (_.isNil(cardData.expirationDate)) return false

  const expirationYear = cardData.expirationDate.substring(0, 4)
  const expirationMonth = cardData.expirationDate.substring(4, 6)
  const expirationDay = cardData.expirationDate.substring(6, 8)
  const expirationDate = new Date(expirationYear, expirationMonth, expirationDay)

  const now = Date.now()
  return expirationDate < now
}

Brain.prototype.triggerSanctions = function triggerSanctions () {
  const dispatchBySanctions = customerSanction => {
    const action = customerSanction ? 'SUCCESS' : 'FAILURE'
    sanctions.dispatch(action)
  }

  const customer = this.customer

  // explictly test false since sanctions can be empty
  if (customer.sanctions === false) return dispatchBySanctions(false)

  // BACKWARDS_COMPATIBLITY 7.5
  // older server can't use "trigger sanctions" request
  const serverVersion = this.trader.serverVersion
  if (!serverVersion || semver.lt(serverVersion, '7.5.0-beta.0')) {
    dispatchBySanctions(customer.sanctions)
  }

  return this.trader.triggerSanctions(customer.id)
    .then(result => {
      this.customer = result.customer
      dispatchBySanctions(result.customer.sanctions)
    })
    .catch(err => {
      console.log('sanction error', err)
      dispatchBySanctions(false)
    })
}

Brain.prototype.triggerSuspend = function triggerSuspend () {
  const customer = this.customer
  const now = new Date()
  return this.trader.triggerSuspend(customer.id, this.suspendTriggerId)
    .then(result => {
      this.customer = result.customer
    })
    .catch(err => {
      console.log('block error', err)
    })
    .then(() => {
      return this.showSuspendedCustomer(this.customer, now)
    })
}

Brain.prototype.triggerBlock = function triggerBlock () {
  const customer = this.customer

  return this.trader.triggerBlock(customer.id)
    .then(result => {
      this.customer = result.customer
    })
    .catch(err => {
      console.log('block error', err)
    })
    .then(() => {
      return this.showBlockedCustomer()
    })
}

Brain.prototype.registerCustomInfoRequestData = function registerCustomInfoRequestData (data) {
  customTier.setData(data)
  customTier.dispatch('SEND')
}

Brain.prototype.saveCustomInfoRequestData = function saveCustomInfoRequestData () {
  const customer = this.customer
  const customerData = {
    customRequestPatch: { data: customTier.getData(), infoRequestId: this.customInfoRequestId }
  }

  return this.trader.updateCustomer(customer.id, customerData, this.tx.id)
    .then(result => {
      this.customer = result.customer
      this.setManualTrigger(this.customInfoRequestId)
      customTier.dispatch('SUCCESS')
    })
    .catch(err => {
      console.error('failure saving custom request data', err)
      customTier.dispatch('FAILURE')
    })
}

Brain.prototype.registerUsSsn = function registerUsSsn (ssn) {
  usSsn.setData(ssn)
  usSsn.dispatch('SEND')
}

Brain.prototype.saveUsSsn = function saveUsSsn () {
  const customer = this.customer

  return this.trader.updateCustomer(customer.id, { usSsn: usSsn.getData() }, this.tx.id)
    .then(result => {
      this.customer = result.customer
      this.setManualTrigger('usSsn')
      usSsn.dispatch('SUCCESS')
    })
    .catch(err => {
      console.log('failure saving us ssn error', err)
      usSsn.dispatch('FAILURE')
    })
}

Brain.prototype.fromYYYYMMDD = function (string) {
  let year = string.substring(0, 4)
  let month = string.substring(4, 6)
  let day = string.substring(6, 8)

  return new Date(year, month - 1, day)
}

Brain.prototype.authorizeIdCardData = function authorizeIdCardData () {
  return Promise.resolve()
    .then(() => {
      this.clearTimeoutToScannerCancel()

      const customer = this.customer
      const data = idCardData.getData()
      const idCardDataExpiration = data.expirationDate ? this.fromYYYYMMDD(data.expirationDate) : null

      // BACKWARDS_COMPATIBLITY 7.5.0-beta.2
      // older server does not have id_card_data_raw
      const serverVersion = this.trader.serverVersion
      if (!serverVersion || semver.lt(serverVersion, '7.5.0-beta.2')) {
        return this.trader.updateCustomer(customer.id, {
          idCardData: data,
          idCardDataNumber: data.documentNumber,
          idCardDataExpiration
        }, this.tx.id)
      }
      return this.trader.updateCustomer(customer.id, {
        idCardData: _.omit(['raw'], data),
        idCardDataRaw: JSON.stringify(data.raw),
        idCardDataNumber: data.documentNumber,
        idCardDataExpiration
      }, this.tx.id)
    })
    .then(result => {
      this.customer = result.customer
      idCardData.dispatch('AUTHORIZED')
    }, err => {
      this._fiatError(err)
    })
    .catch(err => {
      console.log('authorizeIdCardData error', err)
      idCardData.dispatch('BLOCKED_ID')
    })
}

Brain.prototype.scanPhotoCard = function scanPhotoCard () {
  this.scanBayLightOn()
  this.scanner.scanPhotoCard((err, result) => {
    this.scanBayLightOff()
    this.startDisabled = false

    if (err) {
      console.log(err)
      return idCardPhoto.dispatch('SCAN_ERROR')
    }

    if (!result) {
      console.log('No card photo result')
      return
    }

    idCardPhoto.setData(result.toString('base64'))
    this.setManualTrigger('idCardPhoto')
    return idCardPhoto.dispatch('SCANNED')
  })
}

Brain.prototype.authorizePhotoCardData = function authorizePhotoCardData () {
  return Promise.resolve()
    .then(() => {
      this.clearTimeoutToScannerCancel()

      const customer = this.customer
      const data = idCardPhoto.getData()
      return this.trader.updateCustomer(customer.id, {
        idCardPhotoData: data
      }, this.tx.id)
    })
    .then(result => {
      this.customer = result.customer
      idCardPhoto.dispatch('AUTHORIZED')
    }, err => {
      this._fiatError(err)
    })
    .catch(err => {
      console.log('authorizePhotoCardData error', err)
      idCardPhoto.dispatch('BLOCKED_ID')
    })
}

Brain.prototype.retryFacephoto = function retryFacephoto () {
  facephoto.dispatch('RETRY')
}

Brain.prototype.takeFacephoto = function takeFacephoto () {
  this.scanner.takeFacephoto((err, result) => {
    this.startDisabled = false

    if (err) {
      console.log(err)
      return facephoto.dispatch('SCAN_ERROR')
    }

    if (!result) {
      console.log('No photo result')
      return
    }

    console.log('DEBUG: ** Acceptable result, setting facephoto data! **')

    facephoto.setData(result.toString('base64'))
    this.setManualTrigger('facephoto')
    return facephoto.dispatch('PHOTO_TAKEN')
  })
}

Brain.prototype.takeFacePhotoTC = function takeFacePhotoTC () {
  this.scanner.takeFacePhotoTC((err, result) => {
    if (err) {
      console.log(err)
      return
    }

    facephoto.setTCData(result.toString('base64'))
  })
}

Brain.prototype.authorizeFacephotoData = function authorizeFacephotoData () {
  return Promise.resolve()
    .then(() => {
      this.clearTimeoutToScannerCancel()

      const customer = this.customer
      const data = facephoto.getData()
      return this.trader.updateCustomer(customer.id, {
        frontCameraData: data
      }, this.tx.id)
    })
    .then(result => {
      this.customer = result.customer
      facephoto.dispatch('AUTHORIZED')
    }, err => {
      this._fiatError(err)
    })
    .catch(err => {
      console.log('facephoto error', err)
      facephoto.dispatch('BLOCKED_ID')
    })
}

// TODO: abstract this
Brain.prototype._setupWebcam = function _setupWebcam () {
  const rootPath = '/sys/bus/usb/devices/2-1'

  if (!fs.existsSync(rootPath)) return

  const subdirs = fs.readdirSync(rootPath)
  subdirs.forEach(function (dir) {
    if (dir.indexOf('2-1') === 0) {
      const autosuspendPath = rootPath + '/' + dir + '/power/autosuspend'
      try {
        fs.writeFileSync(autosuspendPath, '-1')
      } catch (ex) {
        // File doesn't exist, that's ok.
      }
    }
  })
}

Brain.prototype.setupHardware = function setupHardware () {
  const hardware = this.determinePlatform()

  switch (hardware) {
    case 'N7G1':
      return this.setupN7()
    case 'AAEON':
      return this.setupAaeon()
  }
}

Brain.prototype.setupAaeon = function setupAaeon () {
  const timeResyncPath = path.resolve(__dirname, '../exec/time-resync.sh')
  cp.exec(timeResyncPath, {}, err => {
    if (err) console.log(err)
  })
}

Brain.prototype.setupN7 = function setupN7 () {
  const backlightPath = '/sys/class/backlight/pwm-backlight/brightness'
  if (fs.existsSync(backlightPath)) fs.writeFileSync(backlightPath, '160\n')

  cp.exec('busybox ntpd -p time.nist.gov', {}, err => {
    if (err) console.log(err)
  })

  this._setupWebcam()
  this._setupCheckPower()
}

Brain.prototype.mapCryptoUnitsDisplay = function mapCryptoUnitsDisplay (coins) {
  return _.map(coin => {
    const coinSettings = coinUtils.getCryptoCurrency(coin.cryptoCode)
    const defaultUnit = _.head(_.keys(coinSettings.units))
    const unitSelected = _.get('cryptoUnits')(coin)
    const unit = _.includes(unitSelected, _.keys(coinSettings.units)) ? unitSelected : defaultUnit

    const { displayScale, displayCode } = _.get(['units', unit])(coinSettings)
    return _.assign(coin, {
      displayCode: displayCode,
      displayScale: displayScale,
      unitScale: coinSettings.unitScale
    })
  })(coins)
}

Brain.prototype._connectedBrowser = function _connectedBrowser () {
  //  TODO: have to work on this: console.assert(this.state === State.IDLE)
  console.log('connected to browser')
  const cryptomatModel = this.rootConfig.cryptomatModel || 'sintra'

  const wifiList = this.state === 'wifiList' && this.wifis
    ? this.wifis
    : []

  if (!this.trader || !this.trader.coins) {
    const rec = {
      action: this.state,
      wifiList,
      locale: 'en-US',
      cryptomatModel,
      version,
      operatorInfo: this.trader ? this.trader.operatorInfo : operatorInfo.load(this.dataPath)
    }

    return this.browser().send(rec)
  }

  const cryptoCode = this.singleCrypto()
    ? this.trader.coins[0].cryptoCode
    : null

  const _rates = {
    rates: this.trader.rates(cryptoCode),
    cryptoCode: cryptoCode,
    coins: coinUtils.cryptoCurrencies()
  }

  const rates = cryptoCode
    ? _rates
    : undefined

  const fullRec = {
    action: this.state,
    localeInfo: this.localeInfo,
    fiatCode: this.fiatCode,
    cryptoCode: cryptoCode,
    cassettes: this.uiCassettes,
    coins: this.trader.coins,
    twoWayMode: this.twoWayMode(),
    wifiList: wifiList,
    rates,
    version,
    operatorInfo: this.trader.operatorInfo,
    cryptomatModel,
    areThereAvailablePromoCodes: this.trader.areThereAvailablePromoCodes,
    supportedCoins: this.mapCryptoUnitsDisplay(this.trader.coins)
  }

  this.browser().send(fullRec)
}

Brain.prototype._processRequest = function _processRequest (req) {
  if (this.areYouSureHandled(req.button)) {
    return this.areYouSure()
  }

  if (_.includes(req.button, ARE_YOU_SURE_ACTIONS)) {
    return this._processAreYouSure(req)
  }

  if (this.flow) {
    return this.flow.handle(req.button, req.data)
  }

  this._processReal(req)
}

Brain.prototype._processAreYouSure = function _processAreYouSure (req) {
  switch (req.button) {
    case 'continueTransaction':
      this.continueTransaction(req.data)
      break
    case 'cancelTransaction':
      this.cancelTransaction(req.data)
      break
  }
}

Brain.prototype._processReal = function _processReal (req) {
  const model = deviceConfig.cryptomatModel || 'sintra'

  switch (req.button) {
    case 'locked':
      this._locked()
      break
    case 'unlock':
      this._unlock(req.data)
      break
    case 'cancelLockPass':
      this._cancelLockPass()
      break
    case 'wifiSelect':
      this._wifiPass(req.data)
      break
    case 'wifiConnect':
      this._wifiConnect(req.data)
      break
    case 'cancelWifiList':
      this._cancelWifiList()
      break
    case 'cancelWifiPass':
      this._cancelWifiPass()
      break
    case 'initialize':
      this.initialize()
      break
    case 'pairingScan':
      this._pairingScan()
      break
    case 'pairingScanCancel':
      this.scanner.cancel()
      break
    case 'pairingErrorOk':
      this._unpaired()
      break
    case 'testMode':
      this._testMode()
      break
    case 'start':
      this._chooseCoin(req.data)
      break
    case 'idDataActionCancel':
      this._scanActionCancel(idCardData)
      break
    case 'idPhotoActionCancel':
      this._scanActionCancel(idCardPhoto)
      break
    case 'cancelIdScan':
      this._cancelIdScan()
      break
    case 'cancelUsSsn':
      this.failedCompliance = 'usSsn'
      this.failedComplianceValue = this.requirementAmountTriggered[this.failedCompliance]

      if (this.returnState && !_.includes(this.complianceReason, ARE_YOU_SURE_HANDLED_SMS_COMPLIANCE)) {
        return this.smsFlowHandleReturnState()
      }

      this._idle()
      break
    case 'idCodeFailedRetry':
      idCardData.start()
      break
    case 'idVerificationFailedOk':
      idCardData.dispatch('FAIL')
      break
    case 'photoScanVerificationCancel':
      idCardPhoto.dispatch('FAIL')
      break
    case 'cancelScan':
      this._cancelScan()
      break
    case 'bye':
      this._bye()
      break
    case 'retryPhotoScan':
      idCardPhoto.start(model)
      break
    case 'fiatReceipt':
      this._fiatReceipt()
      break
    case 'cancelInsertBill':
      this._cancelInsertBill()
      break
    case 'sendCoins':
      this._sendCoins()
      break

    /**
     * User clicked finish button before completing sms compliance.
     * If the user has inserted any bills, set the sendCoins state
     * else redirect user to chooseCoin state
     */
    case 'finishBeforeSms':
      if (this.tx.direction === 'cashOut') this._idle()
      if (this.tx.fiat.gt(0)) return this._sendCoins()
      this._idle()
      break
    case 'completed':
      this._completed()
      break
    case 'machine':
      this._machine()
      break
    case 'cancelMachine':
      this._cancelMachine()
      break
    case 'powerOff':
      this._powerOffButton()
      break
    case 'cam':
      this._cam()
      break
    case 'fixTransaction':
      this._fixTransaction()
      break
    case 'abortTransaction':
      this._abortTransaction()
      break
    case 'chooseFiatCancel':
      this._chooseFiatCancel()
      break
    case 'fiatButton':
      this._fiatButton(req.data)
      break
    case 'clearFiat':
      this._clearFiat()
      break
    case 'depositTimeout':
      this._depositTimeout()
      break
    case 'depositTimeoutNotSent':
      this.depositTimeoutNotSent()
      break
    case 'cashOut':
      this._cashOut()
      break
    case 'redeem':
      this._redeem()
      break
    case 'changeLanguage':
      this._timedState('changeLanguage')
      break
    case 'setLocale':
      this._setLocale(req.data)
      break
    case 'idle':
      this._idle()
      break
    case 'chooseCoin':
      this._chooseCoin(req.data)
      break
    case 'retryFacephoto':
      this.retryFacephoto()
      break
    case 'scanIdCardPhoto':
      idCardPhoto.dispatch('READY_TO_SCAN')
      break
    case 'permissionIdCompliance':
      this.permissionsGiven.id = true
      this._continueSmsCompliance()
      break
    case 'permissionSmsCompliance':
      this.permissionsGiven.sms = true
      this._continueSmsCompliance()
      break
    case 'permissionPhotoCompliance':
      this.permissionsGiven.photo = true
      this._continueSmsCompliance()
      break
    case 'permissionUsSsnCompliance':
      this.permissionsGiven.usSsn = true
      this._continueSmsCompliance()
      break
    case 'blockedCustomerOk':
      this._idle()
      break
    case 'termsAccepted':
      this.acceptTerms()
      break
    case 'invalidAddressTryAgain':
      this._startAddressScan()
      break
    case 'printAgain':
      this._privateWalletPrinting()
      break
    case 'printerScanAgain':
      this._startPrintedWalletScan()
      break
    case 'usSsn':
      this.registerUsSsn(req.data)
      break
    case 'insertPromoCode':
      this._insertPromoCode()
      break
    case 'cancelPromoCode':
      this._cancelPromoCode()
      break
    case 'submitPromoCode':
      this._submitPromoCode(req.data)
      break
    case 'permissionCustomInfoRequest':
      this.permissionsGiven[this.customInfoRequestId] = true
      this._continueSmsCompliance()
      break
    case 'cancelCustomInfoRequest':
      this.failedCompliance = this.customInfoRequestId
      this.failedComplianceValue = this.requirementAmountTriggered[this.failedCompliance]

      if (this.returnState && !_.includes(this.complianceReason, ARE_YOU_SURE_HANDLED_SMS_COMPLIANCE)) {
        return this.smsFlowHandleReturnState()
      }
      this._idle()
      break
    case 'customInfoRequestSubmit':
      return this.registerCustomInfoRequestData(req.data)
    case 'sendSmsReceipt':
      this._sendSmsReceipt()
      break
    case 'printReceipt':
      this._startPrintReceipt()
      break
    default:
      break
  }
}

Brain.prototype._continueSmsCompliance = function () {
  if (this.tx.direction === 'cashOut' || !this.tx.toAddress) {
    return this.smsCompliance({ returnState: this.returnState })
  }

  const returnState = this.tx.fiat.eq(0)
    ? 'acceptingFirstBill'
    : 'acceptingBills'
  this.smsCompliance({ returnState })
}

Brain.prototype._setState = function _setState (state, oldState) {
  if (this.state === state) return false

  if (oldState) this._assertState(oldState)

  if (this.currentScreenTimeout) {
    clearTimeout(this.currentScreenTimeout)
    this.currentScreenTimeout = null
  }

  // Starting a transaction
  if (this.isIdleState()) this.trader.setConfigVersion()

  this.state = state

  this.emit(state)
  this.emit('newState', state)
  if (this.trader) this.trader.stateChange(state, this.isIdleState())

  return true
}

Brain.prototype._locked = function _locked () {
  this._setState('lockedPass', 'locked')
  this.browser().send({ action: 'lockedPass' })
}

Brain.prototype._unlock = function _unlock () {
  this._wifiList()
}

Brain.prototype._cancelLockPass = function _cancelLockPass () {
  this._setState('locked', 'lockedPass')
  this.browser().send({ action: 'locked' })
}

Brain.prototype._wifiList = function _wifiList () {
  this._setState('wifiList')
  this.browser().send({ action: 'wifiList' })
}

Brain.prototype._wifiPass = function _wifiPass (data) {
  this.browser().send({ action: 'wifiPass', wifiSsid: data })
  this.wifi.stopScanning()
  this._setState('wifiPass')
  console.log('connecting to %s', data.ssid)
}

Brain.prototype._wifiConnect = function _wifiConnect (data) {
  this._setState('wifiConnecting', 'wifiPass')
  this.browser().send({ action: 'wifiConnecting' })
  const rawSsid = data.rawSsid
  const ssid = data.ssid
  const self = this
  this.wifi.connect(rawSsid, ssid, data.pass, function (err, ip) {
    if (err) {
      // TODO: error screen
      console.log(err.stack)
      const ssidData = {
        ssid: ssid,
        displaySsid: self.wifi.displaySsid(ssid)
      }
      self._wifiPass(ssidData)
    } else {
      self.config.ip = ip
      self._wifiConnected()
    }
  })
}

Brain.prototype._cancelWifiList = function _cancelWifiList () {
  //  this._setState('locked', 'wifiList')
  //  this.browser().send({action: 'locked'})
}

Brain.prototype._cancelWifiPass = function _cancelWifiPass () {
  this.browser().send({ action: 'wifiList' })
  this.wifi.startScanning()
  this._setState('wifiList', 'wifiPass')
}

Brain.prototype._wifiConnecting = function _wifiConnecting () {
  this._setState('wifiConnecting')
  this.browser().send({ action: 'wifiConnecting' })
}

Brain.prototype._wifiConnected = function _wifiConnected () {
  if (this.state === 'maintenance') return
  this._setState('wifiConnected')
  this.initTrader()
}

Brain.prototype._unpaired = function _unpaired () {
  this._setState('unpaired')
  this.browser().send({ action: 'unpaired', version })
  db.clean(this.dbRoot)
}

Brain.prototype._pairingScan = function _pairingScan () {
  this._setState('pairingScan')
  this.browser().send({ action: 'pairingScan' })

  this.scanner.scanPairingCode((err, totem) => {
    if (err) return this._pairingError(err)
    if (!totem) return this.initTrader()

    this._pair(totem)
  })
}

Brain.prototype.activate = function activate () {
  const connectionInfo = pairing.connectionInfo(this.connectionInfoPath)
  const config = this.rootConfig
  const protocol = config.http ? 'http:' : 'https:'

  this._transitionState('booting')

  if (config.mockTrader) {
    this.trader = require('./mocks/trader')(protocol, this.clientCert, connectionInfo, this.dataPath, deviceConfig.cryptomatModel)
  } else {
    this.trader = require('./trader')(protocol, this.clientCert, connectionInfo, this.dataPath, deviceConfig.cryptomatModel)
  }

  this.idVerify = require('./compliance/id_verify').factory({ trader: this.trader })

  this._initTraderEvents()

  return this.traderRun()
    .then(() => this.initNetworkMeasurements())
    .then(() => this.initValidator())
}

Brain.prototype._pair = function _pair (totem) {
  const self = this
  this._transitionState('pairing')

  const model = platformDisplay(this.determinePlatform())
  return pairing.pair(totem, this.clientCert, this.connectionInfoPath, model, this.numberOfCassettes)
    .then(() => this.activate())
    .catch(err => {
      console.log(err.stack)
      self._pairingError(err)
    })
}

Brain.prototype._pairingError = function _pairingError (err) {
  this._setState('pairingError')
  this.browser().send({ action: 'pairingError', err: err.message })
}

Brain.prototype._isTestMode = function _isTestMode () {
  return this.testModeOn
}

Brain.prototype._testMode = function _testMode () {
  const self = this
  this.testModeOn = true
  this.traderOld = this.trader
  this.trader.removeAllListeners()
  this.trader = require('./mocks/trader')()
  this._initTraderEvents()
  this.networkDown = false
  this.billValidator.run(function () {
    self.trader.run()
    self._idle()
  })
}

Brain.prototype._testModeOff = function _testModeOff () {
  const self = this
  this.billValidator.close(function () {
    self.testModeOn = false
    self.trader.removeAllListeners()
    self.trader = self.traderOld
    self._initTraderEvents()
    self._transitionState('virgin', { version })
  })
}

function buildUiCassettes (cassettes, virtualCassettes) {
  const result = _.cloneDeep(cassettes)

  _.each(it => result.push({denomination: it, count: null}), virtualCassettes)
  const sortedDenominations =
    _.sortBy(el => parseInt(el.denomination, 10), result)

  return sortedDenominations
}

Brain.prototype._isPendingScreen = function _isPendingScreen () {
  return _.includes(this.state, ['goodbye'])
}

Brain.prototype.initTrader = function initTrader () {
  const connectionInfo = pairing.connectionInfo(this.connectionInfoPath)
  const config = this.rootConfig

  if (!connectionInfo && !config.mockTrader) {
    this._unpaired()
    return false
  }

  this.activate()

  return true
}

Brain.prototype.initValidator = function initValidator () {
  console.log('Waiting for server...')
  const h = setInterval(() => {
    if (_.isNil(this.fiatCode)) return

    clearInterval(h)

    this.billValidator.setFiatCode(this.fiatCode)

    return this.billValidator.run(err => {
      if (err) return this._billValidatorErr(err)
      console.log('Bill validator connected.')
    })
  }, 200)
}

Brain.prototype._idle = function _idle (locale) {
  const self = this
  const delay = transitionTime
    ? MIN_SCREEN_TIME - (Date.now() - transitionTime)
    : 0

  if (delay > 0 && self._isPendingScreen()) {
    setTimeout(function () { self._idle(locale) }, delay)
    return
  }

  emit('ledsOff')

  this.disableBillValidator()

  if (this.networkDown) return this._forceNetworkDown()

  /*
   * TODO: Once we move to the GraphQL poller: There's a way to manually force
   * a query to run even when using automatic polling.
   */
  const pollPromise = this.trader.poll()
  this.idVerify.reset()
  this.currentPhoneNumber = null
  this.currentSecurityCode = null
  this.numCoins = this.trader.coins.length
  this.tx = Tx.newTx()
  this.pk = null
  this.bill = null
  this.lastRejectedBillFiat = BN(0)
  this.failedCompliance = null
  this.failedComplianceValue = null
  this.redeem = false
  this.returnState = null
  this.complianceReason = null
  this.flow = null
  this.permissionsGiven = {}
  this.requirementAmountTriggered = {}
  this.suspendTriggerId = null

  /**
   * Clear any data from previously
   * validated customers (id & dailyVolume)
   */
  this.customer = null
  this.customerTxHistory = []
  this.txBlockedByManualTrigger = false
  facephoto.cleanTCData()

  this._setState('pendingIdle')

  // We've got our first contact with server

  const localeInfo = _.cloneDeep(this.localeInfo)
  locale = locale || localeInfo.primaryLocale
  localeInfo.primaryLocale = locale

  this.localeInfo = localeInfo

  this.beforeIdleState = false
  this.trader.clearConfigVersion()
  this.trader.cancelDispense()
  this.scanner.cancel()

  this.tx = Tx.update(this.tx, { fiatCode: this.fiatCode })

  pollPromise
    .then(() => this._idleByMode(this.localeInfo))
    .catch(console.log)
}

Brain.prototype._idleByMode = function _idleByMode (localeInfo) {
  if (this.trader.twoWayMode) {
    this._idleTwoWay(localeInfo)
  } else {
    this._idleOneWay(localeInfo)
  }
}

Brain.prototype.singleCrypto = function singleCrypto () {
  return this.trader.coins.length === 1
}

Brain.prototype.twoWayMode = function twoWayMode () {
  return this.trader.twoWayMode
}

/**
 * Check if the customer is suspended
 *
 * That happens if the customer has reached
 * one of the enabled compliance tier thresholds
 *
 * @name isSuspended
 * @function
 *
 * @param {object} customer Acting customer
 * @param {date} now Current date
 * @returns {bool} Whether customer is suspended or not
 */
Brain.prototype.isSuspended = function isSuspended (customer, now) {
  return customer && customer.suspendedUntil && new Date(customer.suspendedUntil) > now
}

/**
 * Display the suspended screens for customer
 * If the customer hasn't inserted bills yet,
 * the suspendedCustomer screen will displayed with ok button,
 * else the bill screen will be displayed with the relative error message
 *
 * @name showSuspendedCustomer
 * @function
 *
 * @param {object} customer Acting customer
 * @param {date} now Current date
 *
 */
Brain.prototype.showSuspendedCustomer = function showSuspendedCustomer (customer, now) {
  const data = this.getHardLimitReachedData(customer, now)

  /*
   * When doing cashOut just show the hardLimitReached screen
   */
  if (this.tx.direction === 'cashOut') {
    return this._timedState('hardLimitReached', { data })
  }

  /*
   * Current transaction's fiat not including current bill
   */

  const insertedBills = this.tx.fiat.gt(0)
  if (!insertedBills) {
    return this._timedState('hardLimitReached', { data })
  }

  /*
   * Set acceptingBills first as transition (in updateBillScreen) so that sendOnly
   * reason message would be displayed on that screen
   */
  this.updateBillScreen(true)
    .then(() => {
      this.browser().send({
        sendOnly: true,
        reason: 'blockedCustomer',
        cryptoCode: this.tx.cryptoCode
      })
    })
}

/*
* Calculates the time difference between the
* current date and the suspension time
*
* @name hardLimitReached
* @function
*
* @param {object} customer Acting customer
* @param {date} now Current date
* @returns {object} hard limit
*/
Brain.prototype.getHardLimitReachedData = function getHardLimitReachedData (customer, now) {
  const diff = new Date(customer.suspendedUntil).valueOf() - now.valueOf()

  const diffInWeeks = _.floor(diff / 1000 / 60 / 60 / 24 / 7)
  const diffInDays = _.floor((diff / 1000 / 60 / 60 / 24) - (diffInWeeks * 7))
  const diffInHours = _.ceil((diff / 1000 / 60 / 60) - (diffInDays * 24) - (diffInWeeks * 7))

  return {
    hardLimit: {
      hardLimitWeeks: diffInWeeks,
      hardLimitDays: diffInDays,
      hardLimitHours: diffInHours
    }
  }
}

/**
 * Check if the customer is blocked
 *
 * That happens if the customer has reached
 * one of the enabled compliance tier thresholds
 * and has the relevant override status to blocked
 *
 * @name isBlocked
 * @function
 *
 * @param {object} customer Acting customer
 * @returns {bool} Whether customer is blocked or not
 */
Brain.prototype.isBlocked = function isBlocked (customer) {
  return customer.authorizedOverride === 'blocked'
}

/**
 * Display the blocked screens for customer
 * If the customer hasn't inserted bills yet,
 * the blockedCustomer screen will displayed with ok button,
 * else the bill screen will be displayed with the relative error message
 *
 * @name showBlockedCustomer
 * @function
 *
 * @param {object} customer Acting customers
 */
Brain.prototype.showBlockedCustomer = function showBlockedCustomer () {
  /*
   * When doing cashOut just show the blockCustomer screen
   */
  if (this.tx.direction === 'cashOut') {
    return this._transitionState('blockedCustomer')
  }

  /*
   * Current transaction's fiat not including current bill
   */

  const insertedBills = this.tx.fiat.gt(0)
  if (!insertedBills) {
    return this._transitionState('blockedCustomer', { insertedBills })
  }

  /*
   * Set acceptingBills first as transition (in updateBillScreen) so that sendOnly
   * reason message would be displayed on that screen
   */
  this.updateBillScreen(true)
    .then(() => {
      this.browser().send({
        sendOnly: true,
        reason: 'blockedCustomer',
        cryptoCode: this.tx.cryptoCode
      })
    })
}

Brain.prototype.smsCompliance = function smsCompliance (opts = {}) {
  this.returnState = opts.returnState
  this.complianceReason = opts.reason

  /**
   * If the phone is already verified
   * proceeed with the next compliance tier
   */
  if (this.tx.phone) {
    return this.smsFlowHandleReturnState()
  }

  const flow = new sms.Flow({ noCode: opts.noCode })
  this.flow = flow

  flow.on('screen', rec => {
    this._transitionState(rec.screen, { context: 'compliance' })
  })

  flow.on('idle', () => {
    this._idle()
  })

  flow.on('sendCode', phone => {
    this.trader.phoneCode(phone.phone)
      .then(result => {
        this.customer = result.customer
        this.txBlockedByManualTrigger = false

        // BACKWARDS_COMPATIBLITY 7.5
        // Old servers don't send txHistory
        const serverVersion = this.trader.serverVersion
        if (!serverVersion || semver.lt(serverVersion, '7.5.0-beta.0')) {
          this.customerTxHistory = []
        } else {
          this.customerTxHistory = result.customer.txHistory.filter(it => it.id !== this.tx.id)
        }

        this.tx = Tx.update(this.tx, { customerId: result.customer.id })

        /*
         * Check to see if customer is blocked
         * and show the relevant screen
         */
        if (this.isBlocked(this.customer)) {
          this.flow = null
          return this.showBlockedCustomer()
        }
        const now = new Date()

        /*
         * Check to see if customer is suspended
         * and show the relevant screen
         */
        if (this.isSuspended(this.customer, now)) {
          this.flow = null
          return this.showSuspendedCustomer(this.customer, now)
        }

        /*
         * Check to see if customer has individual discounts assigned
         * and apply them
         */
        this.verifyCustomerDiscounts(this.customer.discount, 'individualDiscount')

        return flow.handle('requiredSecurityCode', result.code)
      })
      .catch(err => {
        if (err.name === 'BadNumberError') {
          return flow.handle('badPhoneNumber')
        }

        /**
         * In case of API error throw
         */
        if (err.statusCode === 500) {
          throw err
        }

        /**
         * In case the returnState is acceptingBills,
         * display the acceptingBills screen with
         * networkDown reason and sendOnly flag to true
         * instead of a networkDown screen before user
         * returns to acceptingBills
         *
         * If returnState is not  acceptingBills this flag
         * will be ignored. Brain will handle the networkDown
         *
         */
        this.networkDown = true
        this.smsFlowHandleReturnState()
      })
      .catch(err => {
        this.flow = null
        this._fiatError(err)
      })
  })

  flow.on('success', () => {
    const phone = flow.phone
    this.flow = null

    const txPromise = this.redeem
      ? this.trader.fetchPhoneTx(phone)
      : Promise.resolve(Tx.update(this.tx, { phone }))

    return txPromise
      .then(tx => {
        this.tx = tx
        return this.smsFlowHandleReturnState()
      })
      .catch(err => {
        if (err.statusCode === 404) {
          return this._timedState('unknownPhoneNumber')
        }

        if (err.statusCode === 411) {
        // Transaction not seen on the blockchain
          this.tx = null
          return this._timedState('txNotSeen')
        }

        if (err.statusCode === 412) {
        // There are unconfirmed transactions
          this.tx = null
          return this._timedState('unconfirmedDeposit')
        }

        this._fiatError(err)
        throw err
      })
  })

  flow.on('fail', () => {
    this.flow = null
    this.failedCompliance = 'sms'
    this.failedComplianceValue = this.requirementAmountTriggered[this.failedCompliance]

    if (this.returnState && !_.includes(this.complianceReason, ARE_YOU_SURE_HANDLED_SMS_COMPLIANCE)) {
      return this.smsFlowHandleReturnState()
    }

    this._idle()
  })

  flow.handle('start')
}

Brain.prototype.isManualTier = function isManualTier (tier) {
  return _.get(tier, this.trader.triggersAutomation) === TRIGGER_AUTOMATION.MANUAL
}

Brain.prototype.validateTier = function validateTier (tier, triggerTx, customerTier, requiredTiers) {
  const requiredManualTiers = _.filter(this.isManualTier.bind(this), requiredTiers)
  const scannedManualTiers = _.filter(tier => _.get(tier, this.manualTriggersDataProvided), requiredManualTiers)

  // If the tier is not manual, allow pending values
  if (!_.includes(tier, requiredManualTiers)) return !_.isEmpty(customerTier)

  // If the tier is manual, block pending
  this.txBlockedByManualTrigger = true
  return !_.isEmpty(customerTier) || _.includes(tier, scannedManualTiers)
}

Brain.prototype.setManualTrigger = function setManualTrigger (code) {
  if (this.isManualTier(code)) {
    this.manualTriggersDataProvided[code] = true
  }
}

Brain.prototype.isTierCompliant = function isTierCompliant (tier, triggerTx, requiredTiers) {
  const tx = this.tx
  const customer = this.customer || {}

  // custom requests have uuid
  const tierOrCustom = uuid4.validate(tier) ? 'custom' : tier

  switch (tierOrCustom) {
    case 'sms':
      return !_.isNil(tx.phone)
    case 'idCardData':
      if (customer.idCardDataOverride === 'verified') return true
      if (customer.idCardDataOverride === 'blocked') return false
      return this.validateTier(tier, triggerTx, customer.idCardData, requiredTiers)
    case 'idCardPhoto':
      if (customer.idCardPhotoOverride === 'verified') return true
      if (customer.idCardPhotoOverride === 'blocked') return false
      return this.validateTier(tier, triggerTx, customer.idCardPhotoPath, requiredTiers)
    case 'sanctions':
      return customer.sanctions
    case 'facephoto':
      if (customer.frontCameraOverride === 'verified') return true
      if (customer.frontCameraOverride === 'blocked') return false
      return this.validateTier(tier, triggerTx, customer.frontCameraPath, requiredTiers)
    case 'usSsn':
      if (customer.usSsnOverride === 'verified') return true
      if (customer.usSsnOverride === 'blocked') return false
      return this.validateTier(tier, triggerTx, customer.usSsn, requiredTiers)
    case 'block':
    case 'suspend':
      return false
    case 'custom':
      const customInfoRequestId = tier
      const customerData = _.find(['info_request_id', customInfoRequestId])(customer.customInfoRequestData)

      if (_.isNil(customerData)) return false
      if (customerData.override === 'verified') return true
      if (customerData.override === 'blocked') return false
      return this.validateTier(customInfoRequestId, triggerTx, customerData.customer_data, requiredTiers)
    default:
      throw new Error(`Unsupported tier: ${tier}`)
  }
}

Brain.prototype.minimumFiat = function minimumFiat () {
  return _.head(this.trader.cassettes).denomination
}

Brain.prototype.smsFlowHandleReturnState = function smsFlowHandleReturnState () {
  this.browser().send({ smsReceiptStatus: this.trader.smsReceiptActive ? 'available' : 'disabled' })

  /**
   * No need to check compliance on redeem,
   * since tx was already checked.
   */
  if (this.redeem) {
    return this._dispenseUpdate(this.tx)
  }

  const returnState = this.returnState
  const tx = this.tx

  const amount = this.complianceAmount()
  const triggerTx = { fiat: amount, direction: tx.direction }

  const nonCompliantTiers = this.nonCompliantTiers(this.trader.triggers, this.customerTxHistory, triggerTx)
  const isCompliant = _.isEmpty(nonCompliantTiers)
  const otherTiers = _.isNil(this.failedCompliance) && !isCompliant

  /**
   * Are there any other compliance tier to run?
   */
  if (otherTiers) {
    return this.runComplianceTiers(nonCompliantTiers)
  }

  // verify if any non compliant manual trigger was scanned and end tx
  if (this.txBlockedByManualTrigger) {
    this.txBlockedByManualTrigger = false
    return this.showBlockedCustomer()
  }

  const isStartOfTx = BN(0).eq(this.tx.fiat)
  const now = new Date()

  if (isStartOfTx && this.isSuspended(this.customer, now)) {
    const data = this.getHardLimitReachedData(this.customer, now)

    return this._timedState('hardLimitReached', { data })
  }

  if (!returnState) {
    /**
     * Return to startScreen
     * to continue cashOut procedure
     */
    if (tx.direction === 'cashOut' && isCompliant) {
      return this.startScreen()
    }

    /**
     * Return to startScreen
     * to continue cashIn procedure
     */
    if (tx.direction === 'cashIn' && isCompliant) {
      return this.startScreen()
    }

    return this._idle()
  }

  if (_.includes(returnState, BILL_ACCEPTING_STATES)) {
    this.enableBillValidator()
  }

  /**
   * Return to idle state only if the pre-sms flow state was
   * acceptingFirstBill and sms flow failed at some point.
   * Otherwise if sms registration was successfull,
   * redirect user to insert the first bill (see below on transition)
   */
  if (returnState === 'acceptingFirstBill' && !isCompliant) {
    return this._idle()
  }

  if (returnState === 'acceptingFirstBill' && isCompliant) {
    this._transitionState(returnState)
    return this._screenTimeout(() => this._idle(), this.config.billTimeout)
  }

  if (returnState === 'chooseFiat') {
    const failedZeroConf = this.exceedsZeroConf(tx) && _.isNil(tx.phone)
    const failedRegistration = failedZeroConf || !isCompliant

    if (failedRegistration) return this._idle()

    // Phone validation succeeded
    return this.toDeposit()
  }

  if (returnState === 'acceptingBills') {
    /**
     * If a network error occured during sms compliance authorization,
     * return to acceptingBills first, and then call _networkDown()
     * to display the networkDown reason instantly,
     * instead of showing networkDown screen
     */
    const hasFailedCompliance = !_.isNil(this.failedCompliance)

    this.updateBillScreen(hasFailedCompliance)
    if (this.networkDown) this._networkDown()
    return
  }

  if (returnState === 'redeemLater') {
    return this._redeemLater()
  }

  if (_.includes(returnState, BILL_ACCEPTING_STATES) && isCompliant) {
    const cb = this.tx.fiat.eq(0)
      ? this._idle.bind(this)
      : this._sendCoins.bind(this)
    this._transitionState(returnState, { tx: this.tx })
    return this._screenTimeout(cb, this.config.billTimeout)
  }

  this._transitionState(returnState)
}

/**
 * Returns the daily volume taking into consideration the compliance restrictions
 * At the start of the tx we add the minimum value for the tx to the volume
 *
 * @returns {BigNumber}
 */
Brain.prototype.complianceAmount = function complianceAmount () {
  const tx = this.tx
  const amount = tx.fiat

  const isStartOfTx = BN(0).eq(amount)

  if (tx.direction === 'cashOut') {
    return isStartOfTx ? this.minimumFiat() : amount
  }

  const lastRejectedBill = _.defaultTo(BN(0), this.lastRejectedBillFiat)

  // We can either have no bill inserted or first bill rejected
  // Grab the higher value to add into the daily volume
  if (isStartOfTx) {
    const coin = _.find(['cryptoCode', tx.cryptoCode], this.trader.coins)
    return amount.add(
      BigNumber.max(
        this.billValidator.lowestBill(coin.minimumTx),
        lastRejectedBill
      )
    )
  }

  // On cash in we always have to take lastRejectedBill into account
  return amount.add(lastRejectedBill)
}

/**
 * Handler to show in screen whether or not the user
 * is allowed to proceed inserting bills or forced to
 * click the send button.
 *
 * Two reasons provided:
 *
 *  1. Transaction limit
 *  2. Low balance
 *
 */
Brain.prototype.completeBillHandling = function completeBillHandling (blockedCustomer) {
  // Available cryptocurrency balance expressed in fiat
  const availableCryptoAsFiat = this.balance().sub(this.tx.fiat)
  const highestBill = this.billValidator.highestBill(availableCryptoAsFiat)
  const hasLowBalance = highestBill.lte(0)

  if (hasLowBalance || blockedCustomer) {
    this.disableBillValidator()
  }

  this.browser().send({
    credit: this._uiCredit(),
    sendOnly: hasLowBalance || blockedCustomer,
    reason: blockedCustomer ? 'blockedCustomer' : false,
    cryptoCode: this.tx.cryptoCode
  })
}

Brain.prototype.startScreen = function startScreen () {
  const direction = this.tx.direction

  // reset T&C accept button flag
  this.termsAcceptButtonPressed = false

  // check if terms screen is enabled
  // and user still need to accept terms
  if (this.mustAcceptTerms()) {
    if (this.trader.terms.tcPhoto && this.hasFrontFacingCamera) {
      this.takeFacePhotoTC()
    }
    return this._transitionState('termsScreen')
  }

  if (direction === 'cashOut') return this._chooseFiat()
  if (direction === 'cashIn') return this._start()

  throw new Error(`No such direction ${direction}`)
}

Brain.prototype.mustAcceptTerms = function mustAcceptTerms () {
  return (
    // check if terms screen is enabled
    this.trader.terms &&
    this.trader.terms.active &&
    // and user still need to accept terms
    !this.tx.termsAccepted
  )
}

Brain.prototype.acceptTerms = function acceptTerms () {
  if (this.scanner.isOpened()) this.scanner.cancel()
  // disable accept button after one click
  this.browser().send({ terms: _.assign(this.trader.terms, { acceptDisabled: true }) })
  if (!this.termsAcceptButtonPressed) {
  // timeout is a safety net to ensure that we close
  // the camera before opening it for another task
    setTimeout(() => {
      // mark terms as accepted
      // and redirect user to start screen
      this.tx = Tx.update(this.tx, { termsAccepted: true })
      this.startScreen()
    }, 1000)
  }
  // avoid setting multiple timeouts
  this.termsAcceptButtonPressed = true
}

function chooseBillDispenser (config) {
  const billDispenserConfig = config.billDispenser
  const billDispenser = billDispenserConfig.model
  const isMockedDispenser = config.mockBillDispenser

  if (isMockedDispenser) {
    return require('./mocks/billdispenser').factory(billDispenserConfig)
  }

  return billDispenser === 'f56'
    ? require('./f56/f56-dispenser').factory(billDispenserConfig)
    : require('./puloon/puloon-dispenser').factory(billDispenserConfig)
}

Brain.prototype._idleTwoWay = function _idleTwoWay (localeInfo) {
  const cassettes = this.trader.cassettes
  const virtualCassettes = this.trader.virtualCassettes
  const uiCassettes = buildUiCassettes(cassettes, virtualCassettes)
  this.uiCassettes = uiCassettes

  if (!this.billDispenser) {
    this.billDispenser = chooseBillDispenser(this.rootConfig)
  }

  if (!this.billDispenser.initialized) this._transitionState('booting')
  if (this.billDispenser.initializing) return

  return this.billDispenser.init({
    cassettes,
    fiatCode: this.trader.locale.fiatCode
  })
    .then(() => this._chooseCoinScreen(localeInfo, uiCassettes))
    .catch(console.log)
}

Brain.prototype._idleOneWay = function _idleOneWay (localeInfo) {
  this._chooseCoinScreen(localeInfo)
}

Brain.prototype._chooseCoinScreen = function _chooseCoinsScreen (localeInfo, cassettes) {
  this._transitionState('chooseCoin', {
    localeInfo: localeInfo,
    cassettes: cassettes,
    coins: this.trader.coins,
    twoWayMode: this.twoWayMode()
  })
}

Brain.prototype._chooseCoin = function _chooseCoin (data) {
  const automatableRequirements = _.keys(this.trader.triggersAutomation)
  this.manualTriggersDataProvided = _.zipObject(automatableRequirements, Array(automatableRequirements.length).fill(false))
  this.txBlockedByManualTrigger = false
  this.tx = Tx.update(this.tx, data)
  this.browser().send({ cryptoCode: data.cryptoCode })
  this.sendRates()
  this.startScreen()
}

Brain.prototype.isIdleState = function isIdleState () {
  return this.state === 'chooseCoin'
}

Brain.prototype._setLocale = function _setLocale (data) {
  const self = this
  this._idle(data.locale)
  this._screenTimeout(function () { self._idle() }, 30000)
}

Brain.prototype.isLowBalance = function isLowBalance () {
  const fiatBalance = this.balance()
  const highestBill = this.billValidator.highestBill(fiatBalance)

  return highestBill.lt(0)
}

Brain.prototype.requiredTiers = function requiredTiers (triggers, history, triggerTx) {
  const triggered = getTriggered(triggers, history, triggerTx)
  const triggeredFormatted = _.map(o => o.customInfoRequestId ? _.assign(o, { requirement: o.customInfoRequestId }) : o, triggered)
  const getHighestSuspend = _.compose(_.get('id'), _.maxBy('suspensionDays'), _.filter({ requirement: REQUIREMENTS.SUSPEND }))

  this.suspendTriggerId = getHighestSuspend(triggeredFormatted)
  this.triggers = triggeredFormatted

  const requirements = _.uniq(_.map(_.get('requirement'))(triggeredFormatted))
  const unorderedTiers = _.isEmpty(requirements) ? [] : _.union(requirements, ['sms'])

  // Custom trigger is identified by its uuid and should be pushed to last
  const requiredTiers = _.sortBy(name => uuid4.validate(name) ? Infinity : _.indexOf(name, ORDERED_REQUIREMENTS))(unorderedTiers)

  this.requirementAmountTriggered = getLowestAmountPerRequirement(triggeredFormatted)
  return requiredTiers
}

Brain.prototype.nonCompliantTiers = function nonCompliantTiers (triggers, history, triggerTx) {
  const requiredTiers = this.requiredTiers(triggers, history, triggerTx)
  return _.filter(tier => !this.isTierCompliant(tier, triggerTx, requiredTiers), requiredTiers)
}

Brain.prototype._start = function _start () {
  if (this.startDisabled) return
  if (this.isLowBalance()) return this._timedState('balanceLow')

  const cryptoCode = this.tx.cryptoCode
  const coin = _.find(['cryptoCode', cryptoCode], this.trader.coins)

  const updateRec = {
    direction: 'cashIn',
    cashInFee: coin.cashInFee,
    commissionPercentage: BN(coin.cashInCommission).div(100),
    rawTickerPrice: BN(coin.rates.ask),
    minimumTx: this.billValidator.lowestBill(coin.minimumTx),
    cryptoNetwork: coin.cryptoNetwork
  }

  const update = _.assignAll([this.tx, updateRec])
  this.tx = Tx.update(this.tx, update)

  const amount = this.complianceAmount()
  const triggerTx = { fiat: amount, direction: this.tx.direction }

  const nonCompliantTiers = this.nonCompliantTiers(this.trader.triggers, this.customerTxHistory, triggerTx)
  const isCompliant = _.isEmpty(nonCompliantTiers)

  if (!isCompliant) {
    return this.smsCompliance()
  }

  const printPaperWallet = this.trader.enablePaperWalletOnly

  this.browser().send({
    tx: this.tx,
    receiptStatus: this.trader.receiptPrintingActive ? 'available' : 'disabled',
    smsReceiptStatus: this.trader.smsReceiptActive && this.customer ? 'available' : 'disabled'
  })

  if (printPaperWallet) {
    try {
      // Only BTC, LTC and BCH supported for now
      if (!_.isNil(coinUtils.createWallet(this.tx.cryptoCode))) {
        return this._privateWalletPrinting()
      }
    } catch (err) {
      return this._idle()
    }
  }

  this._startAddressScan()
}

Brain.prototype._privateWalletPrinting = function _privateWalletPrinting () {
  this._transitionState('cashInWaiting')

  if (!this.printer) {
    console.log('[ERROR]: The kiosk printer was not loaded.')
    return this._timedState('printerError')
  }

  return this.printer.checkStatus(deviceConfig.kioskPrinter, STATUS_QUERY_TIMEOUT)
    .then((printerStatus) => {
      console.log('Kiosk printer status: ', printerStatus)
      if (printerStatus.hasErrors) throw new Error()

      const wallet = coinUtils.createWallet(this.tx.cryptoCode)
      const printerCfg = deviceConfig.kioskPrinter
      this.pk = wallet.privateKey
      return this.printer.printWallet(wallet, printerCfg, this.tx.cryptoCode)
        .then(() => {
          this.tx = Tx.update(this.tx, { isPaperWallet: true, toAddress: wallet.publicAddress })
          this._startPrintedWalletScan(this.tx.toAddress)
        })
    })
    .catch((err) => {
      console.log('[ERROR]: The kiosk printer is in an invalid state.', err)
      return this._timedState('printerError')
    })
}

Brain.prototype._startPrintedWalletScan = function _startPrintedWalletScan () {
  this._transitionState('printerScanAddress')
  const txId = this.tx.id

  if (this.hasNewScanBay()) this.scanBayLightOn()

  this.scanner.scanPK((err, pk) => {
    this.scanBayLightOff()
    clearTimeout(this.screenTimeout)
    this.startDisabled = false

    if (err) this.emit('error', err)
    const startState = _.includes(this.state, ['printerScanAddress', 'goodbye'])
    const freshState = this.tx.id === txId && startState

    if (!freshState) return
    if (!pk) return this._idle()
    if ((err && err.message === 'Invalid address') || this.pk !== pk) {
      return this._timedState('printerScanningError')
    }

    this.browser().send({ tx: this.tx })
    this._handleScan(this.tx.toAddress)
  })

  this.screenTimeout = setTimeout(() => {
    if (this.state !== 'printerScanAddress') return
    this.scanner.cancel()
  }, this.config.qrTimeout)
}

Brain.prototype.scanBayLightOn = function scanBayLightOn () {
  emit('scanBayLightOn')
}

Brain.prototype.scanBayLightOff = function scanBayLightOff () {
  emit('scanBayLightOff')
}

Brain.prototype.handleUnresponsiveCamera = function handleUnresponsiveCamera () {
  if (!this.scanner.isOpened()) return this._idle()

  this._transitionState('maintenance')

  let handle = setInterval(() => {
    if (this.scanner.isOpened()) return
    clearInterval(handle)
    this._idle()
  }, 200)
}

Brain.prototype._scanActionCancel = function _scanActionCancel (fsm) {
  this.clearTimeoutToScannerCancel()
  this.scanner.cancel()
  fsm.dispatch('FAIL')
}

Brain.prototype._cancelIdScan = function _cancelIdScan () {
  this.clearTimeoutToScannerCancel()
  this.startDisabled = true
  this._bye({ timeoutHandler: () => { this.handleUnresponsiveCamera() } })
  this.scanner.cancel()
}

Brain.prototype.hasNewScanBay = function hasNewScanBay () {
  const model = deviceConfig.cryptomatModel
  return model === 'sintra' || model === 'gaia' || model === 'tejo'
}

Brain.prototype._startAddressScan = function _startAddressScan () {
  if (this.billValidatorErrorFlag) {
    this._transitionState('cashInDisabled')
    return setTimeout(() => {
      this._idle()
    }, 7000)
  }
  this._transitionState('scanAddress')
  const txId = this.tx.id

  if (this.hasNewScanBay()) this.scanBayLightOn()

  this.scanner.scanMainQR(this.tx.cryptoCode, (err, address) => {
    this.scanBayLightOff()
    clearTimeout(this.screenTimeout)
    this.startDisabled = false

    if (err && err.message === 'Invalid address') return this._invalidAddress()
    if (err) this.emit('error', err)
    const startState = _.includes(this.state, ['scanAddress', 'goodbye'])
    const freshState = this.tx.id === txId && startState

    if (!freshState) return
    if (!address) return this._idle()
    this._handleScan(address)
  })

  this.screenTimeout = setTimeout(() => {
    if (this.state !== 'scanAddress') return
    this.scanner.cancel()
  }, this.config.qrTimeout)
}

Brain.prototype._bye = function _bye (opts) {
  this._timedState('goodbye', opts)
}

Brain.prototype._invalidAddress = function _invalidAddress () {
  this._timedState('invalidAddress', {
    timeout: this.config.invalidAddressTimeout
  })
}

Brain.prototype._cancelScan = function _cancelScan () {
  this.startDisabled = true
  // TODO new-admin
  this._bye({ timeoutHandler: () => { this.handleUnresponsiveCamera() } })
  this.scanner.cancel()
}

Brain.prototype._cancelInsertBill = function _cancelInsertBill () {
  this._idle()
  this.disableBillValidator()
}

Brain.prototype.isStaticState = function isStaticState () {
  const staticStates = ['chooseCoin', 'idle', 'pendingIdle', 'dualIdle',
    'networkDown', 'unpaired', 'maintenance', 'virgin', 'wifiList']

  return _.includes(this.state, staticStates)
}

Brain.prototype.balance = function balance () {
  const cryptoCode = this.tx.cryptoCode
  if (!cryptoCode) throw new Error('No cryptoCode, this shouldn\'t happen')

  return this.trader.balances[cryptoCode]
}

Brain.prototype.sendRates = function sendRates () {
  const cryptoCode = this.tx.cryptoCode
  if (!cryptoCode) return

  const rec = {
    fiatCode: this.fiatCode,
    rates: {
      rates: this.trader.rates(cryptoCode),
      cryptoCode: cryptoCode,
      coins: coinUtils.cryptoCurrencies()
    },
    coins: this.trader.coins,
    twoWayMode: this.twoWayMode(),
    terms: _.set('delayTimer', this.config.termsDelay, this.trader.terms),
    operatorInfo: this.trader.operatorInfo,
    areThereAvailablePromoCodes: this.trader.areThereAvailablePromoCodes,
    supportedCoins: this.mapCryptoUnitsDisplay(this.trader.coins)
  }

  this.browser().send(rec)
}

Brain.prototype._pollUpdate = function _pollUpdate (needsRefresh) {
  const locale = this.trader.locale
  this.fiatCode = locale.fiatCode
  this.localeInfo = locale.localeInfo

  if (!this.isIdleState()) return

  this.sendRates()
  if (needsRefresh) this._idle()
}

Brain.prototype._networkDown = function _networkDown () {
  if (this.state === 'networkDown') return

  if (_.isEmpty(this.trader.coins)) {
    console.log('No active cryptocurrencies.')
  }

  this.networkDown = true

  const tx = this.tx

  const doForceDown = !tx ||
    !tx.direction ||
    (tx.direction === 'cashIn' && _.isEmpty(tx.bills)) ||
    (tx.direction === 'cashOut' && !tx.toAddress)

  if (doForceDown) return this._forceNetworkDown()

  if (tx.direction !== 'cashIn') return
}

Brain.prototype._forceNetworkDown = function _forceNetworkDown () {
  const self = this

  this.trader.clearConfigVersion()

  if (!this.hasConnected && this.state !== 'connecting') {
    this._transitionState('connecting')
    setTimeout(function () {
      self.hasConnected = true
      if (self.state === 'connecting') self._idle()
    }, self.config.connectingTimeout)
    return
  }

  if (this.hasConnected) this._transitionState('networkDown')
}

const isNonTx = state => _.includes(state, NON_TX_STATES)

let firstUp = true
Brain.prototype._networkUp = function _networkUp () {
  // Don't go to start screen yet
  if (!this.billValidator.hasDenominations()) return

  this.networkDown = false
  this.hasConnected = true

  if (firstUp) {
    firstUp = false
    this.processPending()
  }

  if (isNonTx(this.state)) return this._idle()
}

Brain.prototype._timedState = function _timedState (state, opts) {
  const self = this
  opts = opts || {}

  if (this.state === state) {
    // console.trace('WARNING: Trying to set to same state: %s', state)
    return
  }
  const timeout = opts.timeout || 30000
  const handler = opts.timeoutHandler
    ? opts.timeoutHandler
    : opts.revertState
      ? function () { self._transitionState(opts.revertState) }
      : function () { self._idle() }

  this._transitionState(state, opts.data)
  this._screenTimeout(handler, timeout)
}

Brain.prototype._transitionState = function _transitionState (state, auxData) {
  // TODO refactor code to use this
  // If we're in maintenance state, we stay there till we die
  if (this.state === state || this.state === 'maintenance') return false
  const rec = { action: state, direction: this.tx && this.tx.direction }
  transitionTime = Date.now()
  this._setState(state)
  this.browser().send(_.merge(auxData, rec))
  return true
}

Brain.prototype._cryptoFractionalDigits = function _cryptoFractionalDigits (amount) {
  const log = Math.floor(Math.log(amount) / Math.log(10))
  return (log > 0) ? 2 : 2 - log
}

Brain.prototype._assertState = function _assertState (expected) {
  const actual = this.state
  console.assert(actual === expected,
    'State should be ' + expected + ', is ' + actual)
}

Brain.prototype._handleScan = function _handleScan (address) {
  const waitingTimeout = setTimeout(() => {
    this._transitionState('cashInWaiting')
  }, MIN_WAITING)

  const t0 = Date.now()

  return this.updateTx({ toAddress: address })
    .then(it => {
      this.updateTxCustomerPhoto(it).catch(console.log)
      clearTimeout(waitingTimeout)

      const elapsed = Date.now() - t0
      const extraTime = MIN_WAITING * 2 - elapsed
      const remaining = this.state === 'cashInWaiting'
        ? Math.max(0, extraTime)
        : 0

      if (it.addressReuse) {
        return setTimeout(() => {
          this._timedState('addressReuse')
        }, remaining)
      }

      if (it.blacklisted || !it.validWalletScore) {
        return setTimeout(() => {
          this._timedState('suspiciousAddress')
        }, remaining)
      }

      setTimeout(() => {
        return this._firstBill()
      }, remaining)
    })
}

function emit (_event) {
  const event = _.isString(_event)
    ? { action: _event }
    : _event

  actionEmitter.emit('brain', event)
}

Brain.prototype._firstBill = function _firstBill () {
  this._setState('acceptingFirstBill')
  this.browser().send({
    action: 'scanned',
    buyerAddress: coinUtils.formatAddress(this.tx.cryptoCode, this.tx.toAddress)
  })
  this.enableBillValidator()
  this._screenTimeout(() => this._idle(), this.config.billTimeout)
}

// Bill validating states

Brain.prototype._billInserted = function _billInserted () {
  emit('billValidatorAccepting')
  this.browser().send({ action: 'acceptingBill' })
  this._setState('billInserted')
}

Brain.prototype.enableBillValidator = function enableBillValidator () {
  emit('billValidatorPending')
  this.billValidator.enable()
}

Brain.prototype.disableBillValidator = function disableBillValidator () {
  emit('billValidatorOff')
  this.billValidator.disable()
}

Brain.prototype._billRead = function _billRead (data) {
  const billValidator = this.billValidator

  if (!_.includes(this.state, BILL_ACCEPTING_STATES)) {
    console.trace('Attempting to reject, not in bill accepting state.')
    return billValidator.reject()
  }

  this.insertBill(data.denomination)

  // Current inserting bill
  const currentBill = this.bill.fiat

  // Current transaction's fiat not including current bill
  const fiatBeforeBill = this.tx.fiat

  // Total fiat inserted including current bill
  const fiatAfterBill = fiatBeforeBill.add(currentBill)

  // Limit next bills by failed compliance value
  // if value is null it was triggered by velocity or consecutive days
  const failedTierThreshold = _.isNil(this.failedCompliance) ? BN(Infinity) : BN(this.failedComplianceValue || 0)

  // Available cryptocurrency balance expressed in fiat not including current bill
  const remainingFiatToInsert = BN.klass.min(this.balance(), failedTierThreshold).sub(fiatBeforeBill)

  // Minimum allowed transaction
  const minimumAllowedTx = this.tx.minimumTx

  if (remainingFiatToInsert.lt(currentBill)) {
    billValidator.reject()

    const highestBill = billValidator.highestBill(remainingFiatToInsert)

    if (highestBill.lte(0)) {
      console.log('DEBUG: low balance, attempting disable')
      this.disableBillValidator()
      this.browser().send({
        sendOnly: true,
        cryptoCode: this.tx.cryptoCode
      })

      return
    }

    this.browser().send({
      action: 'highBill',
      highestBill: highestBill.toNumber(),
      reason: 'lowBalance'
    })

    return
  }

  if (fiatAfterBill.lt(minimumAllowedTx)) {
    billValidator.reject()

    const lowestBill = billValidator.lowestBill(minimumAllowedTx)

    this.browser().send({
      action: 'minimumTx',
      lowestBill: lowestBill.toNumber()
    })

    return
  }

  const amount = fiatBeforeBill.add(currentBill)
  const triggerTx = { fiat: amount, direction: this.tx.direction }

  const nonCompliantTiers = this.nonCompliantTiers(this.trader.triggers, this.customerTxHistory, triggerTx)
  const isCompliant = _.isEmpty(nonCompliantTiers)

  // If threshold is 0,
  // the sms verification is being handled at the beginning of this.startScreen.
  if (!isCompliant) {
    // Cancel current bill and disable the insertion of more bills until the compliance is cleared
    this.billValidator.reject()
    this.disableBillValidator()

    // If id tier force another verification screen
    const nonCompliantTier = _.head(nonCompliantTiers)
    const idTier = nonCompliantTier === 'idCardData' || nonCompliantTier === 'idCardPhoto'
    if (idTier) return this.transitionToVerificationScreen(nonCompliantTier)

    return this.runComplianceTiers(nonCompliantTiers)
  }

  // verify if any non compliant manual trigger was scanned and end tx
  if (this.txBlockedByManualTrigger) {
    this.txBlockedByManualTrigger = false
    return this.showBlockedCustomer()
  }

  this.browser().send({
    action: 'acceptingBill',
    readingBill: currentBill.toNumber()
  })

  this._setState('billRead')

  billValidator.stack()
}

Brain.prototype.runComplianceTiers = function (nonCompliantTiers) {
  const tier = _.head(nonCompliantTiers)

  const isCashIn = this.tx.direction === 'cashIn'
  const idTier = tier === 'idCardData' || tier === 'idCardPhoto'
  const smsTier = tier === 'sms'
  const cameraTier = tier === 'facephoto'
  const usSsnTier = tier === 'usSsn'
  const customTier = uuid4.validate(tier)

  const smsScreen = smsTier && isCashIn && !_.get('sms')(this.permissionsGiven)
  const idScreen = idTier && isCashIn && !_.get('id')(this.permissionsGiven)
  const photoScreen = cameraTier && !_.get('photo')(this.permissionsGiven)
  const usSsnScreen = usSsnTier && !_.get('usSsn')(this.permissionsGiven)
  const customScreen = customTier && !_.get(tier)(this.permissionsGiven)
  if (photoScreen && !this.hasFrontFacingCamera) {
    this.suspendTriggerId = 'no-ff-camera'
    return complianceTiers.run('suspend', null, null)
  }

  if (customScreen) {
    this.customInfoRequestId = tier
  }

  if (smsScreen || idScreen || photoScreen || usSsnScreen || customScreen) {
    return this.transitionToVerificationScreen(tier)
  }

  complianceTiers.run(tier, this.rootConfig.cryptomatModel || 'sintra', _.find(['requirement', tier])(this.triggers))
}

Brain.prototype.transitionToVerificationScreen = function (tier) {
  const formattedTier = uuid4.validate(tier) ? 'custom' : tier
  switch (formattedTier) {
    case 'idCardData':
    case 'idCardPhoto':
      this._transitionState('permission_id', {
        tx: this.tx
      })
      break
    case 'facephoto':
      this.scanner.prepareForCapture('facephoto')
      this._transitionState('permission_face_photo', {
        tx: this.tx
      })
      break
    case 'usSsn':
      this._transitionState('usSsnPermission', {
        tx: this.tx
      })
      break
    case 'custom':
      this._transitionState('customInfoRequestPermission', {
        tx: this.tx,
        customInfoRequest: _.get('customInfoRequest.customRequest')(_.find(trigger => trigger.customInfoRequestId === this.customInfoRequestId)(this.triggers))
      })
      break
    default:
      this._transitionState('smsVerification', {
        threshold: this.trader.smsVerificationThreshold,
        tx: this.tx
      })
  }
}

Brain.prototype.saveTx = function saveTx (tx) {
  return db.save(this.dbRoot, tx)
}

Brain.prototype.postTx = function postTx (tx) {
  const postTxF = timedout => {
    const updatedTx = _.assign(tx, { timedout })

    return this.trader.postTx(updatedTx)
      .then(serverTx => ({ tx: serverTx }))
  }

  const timeout$ = Rx.Observable.timer(NETWORK_TIMEOUT_INTERVAL)
    .mapTo({ timedout: true })
    .startWith({ timedout: false })
    .share()

  const source$ = Rx.Observable.interval(ACTIVE_POLL_INTERVAL)
    .startWith(-1)
    .combineLatest(timeout$, (x, r) => r.timedout)
    .mergeMap(postTxF)
    .share()

  // Keep trying in background forever until success
  source$.first(r => r.tx).subscribe(r => this.saveTx(r.tx), _ => {})

  return source$
    .merge(timeout$)
    .first(r => r.tx || r.timedout)
    .toPromise()
    .then(r => {
      if (r.tx) return r.tx
      throw new Error('timeout')
    })
}

Brain.prototype.updateTx = function updateTx (updateTx) {
  const newTx = Tx.update(this.tx, updateTx)
  this.tx = newTx

  return this.saveTx(newTx)
    .then(() => this.postTx(newTx))
    .then(tx => {
      this.tx = tx
      return tx
    })
}

Brain.prototype.updateTxCustomerPhoto = function updateTxCustomerPhoto ({ customerId, id, direction }) {
  const tcPhotoData = facephoto.getTCData()
  if (!tcPhotoData) return Promise.resolve()
  return this.trader.updateTxCustomerPhoto(id, customerId, { tcPhotoData: tcPhotoData, direction: direction })
}

// Don't wait for server response
Brain.prototype.fastUpdateTx = function fastUpdateTx (updateTx) {
  console.log('fastUpdateTx', updateTx)
  const newTx = Tx.update(this.tx, updateTx)
  this.tx = newTx

  this.postTx(newTx)
    .catch(err => console.log(err))

  return this.saveTx(newTx)
}

Brain.prototype.commitCashOutTx = function commitCashOutTx () {
  return this.updateTx({})
    .then(tx => {
      this.updateTxCustomerPhoto(tx).catch(console.log)
      const amountStr = this.toCryptoUnits(tx.cryptoAtoms, tx.cryptoCode).toString()
      const depositUrl = coinUtils.depositUrl(tx.cryptoCode, tx.toAddress, amountStr)
      const layer2Url = coinUtils.depositUrl(tx.cryptoCode, tx.layer2Address, amountStr)
      const toAddress = coinUtils.formatAddress(tx.cryptoCode, tx.toAddress)
      const layer2Address = coinUtils.formatAddress(tx.cryptoCode, tx.layer2Address)

      const depositInfo = {
        toAddress,
        layer2Address,
        depositUrl,
        layer2Url
      }

      this._waitForDispense('notSeen')

      return this.browser().send({ depositInfo })
    })
    .catch(err => this._fiatError(err))
}

Brain.prototype.updateBillScreen = function updateBillScreen (blockedCustomer) {
  const bill = this.bill

  // No going back
  this.clearBill()
  this.lastRejectedBillFiat = BN(0)

  emit('billValidatorPending')

  var billUpdate
  // BACKWARDS_COMPATIBILITY 7.5.0-beta.1
  const serverVersion = this.trader.serverVersion
  if (!serverVersion || semver.lt(serverVersion, '7.5.0-beta.1')) {
    billUpdate = Tx.billUpdateDeprecated(bill)
  } else {
    billUpdate = Tx.billUpdate(bill)
  }

  return this.fastUpdateTx(billUpdate)
    .then(() => {
      this._transitionState('acceptingBills', { tx: this.tx })
      this._screenTimeout(() => this._sendCoins(), this.config.billTimeout)
    })
    .then(() => this.completeBillHandling(blockedCustomer))
}

// TODO: clean this up
Brain.prototype._billRejected = function _billRejected () {
  const self = this
  if (!_.includes(this.state, BILL_ACCEPTING_STATES) && !_.includes(this.state, COMPLIANCE_VERIFICATION_STATES)) return

  this.clearBill()

  const returnState = this.tx.fiat.eq(0)
    ? 'acceptingFirstBill'
    : 'acceptingBills'

  this._transitionState(returnState)

  this._screenTimeout(function () {
    returnState === 'acceptingFirstBill'
      ? self._idle()
      : self._sendCoins()
  }, this.config.billTimeout)

  const response = {
    action: 'rejectedBill',
    credit: this._uiCredit()
  }

  this.browser().send(response)
}

Brain.prototype._billStandby = function _billStandby () {
  if (this.state === 'acceptingBills' || this.state === 'acceptingFirstBill') {
    this.enableBillValidator()
  }
}

Brain.prototype._billJam = function _billJam () {
  // TODO FIX: special screen and state for this
  this.browser().send({ action: 'networkDown' })
}

Brain.prototype._billsEnabled = function _billsEnabled (data) {
  this.billValidatorErrorFlag = false // If enabled, previous errors are no longer an issue
  console.log('Bills enabled codes: 0x%s, 0x%s', data.data1.toString(16),
    data.data2.toString(16))
}

Brain.prototype._stackerOpen = function _stackerOpen () {
  return this.trader.notifyCashboxRemoval()
}

Brain.prototype._uiCredit = function _uiCredit () {
  var updatedBill
  // BACKWARDS_COMPATIBILITY 7.5.0-beta.1
  const serverVersion = this.trader.serverVersion
  if (!serverVersion || semver.lt(serverVersion, '7.5.0-beta.1')) {
    updatedBill = Tx.billUpdateDeprecated(this.bill)
  } else {
    updatedBill = Tx.billUpdate(this.bill)
  }
  const tx = Tx.update(this.tx, updatedBill)

  return {
    cryptoCode: tx.cryptoCode,
    fiat: tx.fiat.toNumber(),
    cryptoAtoms: tx.cryptoAtoms.toNumber(),
    lastBill: _.last(tx.bills.map(bill => bill.fiat.toNumber()))
  }
}

/**
 * Clear the rejected bill and keep i'ts amount as the lastRejectedBillFiat
 *
 * @name clearBill
 * @function
 *
 */
Brain.prototype.clearBill = function clearBill () {
  this.lastRejectedBillFiat = this.bill ? this.bill.fiat : BN(0)
  this.bill = null
}

Brain.prototype.insertBill = function insertBill (bill) {
  console.assert(!this.bill || this.bill.fiat.eq(0), "bill fiat is positive, can't start tx")
  const cryptoCode = this.tx.cryptoCode

  // BACKWARDS_COMPATIBILITY 7.5.1
  const serverVersion = this.trader.serverVersion
  if (!serverVersion || semver.lt(serverVersion, '7.5.1-beta.0')) {
    const exchangeRate = this.trader.rates(cryptoCode).cashIn
    this.bill = Tx.createBillDeprecated(bill, exchangeRate, this.tx)
  } else {
    this.bill = Tx.createBill(bill, this.tx)
  }
}

Brain.prototype._insertPromoCode = function _insertPromoCode () {
  this._transitionState('insertPromoCode')
}

Brain.prototype._cancelPromoCode = function _cancelPromoCode () {
  if (this.tx.direction === 'cashIn') this.returnToCashInState()
  if (this.tx.direction === 'cashOut') this.returnToCashOutState()
}

Brain.prototype._submitPromoCode = function _submitPromoCode (data) {
  const promoCode = data.input

  this.trader.verifyPromoCode(promoCode, this.tx).then(res => {
    /*
      * It's possible for a customer to insert a promo code before inserting the phone data, leading to two possible discounts.
      * In that case, use the bigger discount.
      * See: verifyCustomerDiscounts()
      */
    this.tx = Tx.update(this.tx, { promoCodeApplied: true })

    this.verifyCustomerDiscounts(res.promoCode, 'promoCode')

    const rec = {
      rates: {
        rates: Tx.getRates(this.tx)[this.tx.cryptoCode],
        cryptoCode: this.tx.cryptoCode,
        coins: Tx.coins
      },
      credit: this._uiCredit()
    }

    this.browser().send(rec)

    this.tx.direction === 'cashIn'
      ? this.returnToCashInState()
      : this.returnToCashOutState()
  }).catch(err => {
    console.log('Promo code not found: Error ' + err)
    this._transitionState('invalidPromoCode')
    this._screenTimeout(() => {
      this._cancelPromoCode()
    }, this.config.promoCodeTimeout)
  })
}

Brain.prototype.returnToScanState = function returnToScanState () {
  const callback = this._start.bind(this)
  this._screenTimeout(callback, this.config.qrTimeout)
}

Brain.prototype.returnToCashInState = function returnToCashInState () {
  if (!this.tx.toAddress) return this.returnToScanState()
  const returnState = this.tx.fiat.eq(0)
    ? 'acceptingFirstBill'
    : 'acceptingBills'

  const callback = returnState === 'acceptingFirstBill'
    ? this._idle.bind(this)
    : this._sendCoins.bind(this)

  this._transitionState(returnState, { tx: this.tx })
  this._screenTimeout(callback, this.config.billTimeout)
}

Brain.prototype.returnToCashOutState = function returnToCashOutState () {
  this._transitionState('chooseFiat', {
    chooseFiat: this._getFiatButtonResponse(),
    tx: this.tx
  })
  this._screenTimeout(this._chooseFiatCancel.bind(this), 120000)
}

Brain.prototype.verifyCustomerDiscounts = function verifyCustomerDiscounts (discount, source) {
  if (!_.isNil(discount)) {
    /*
      * It's possible for a customer to insert a promo code before inserting the phone data, leading to two possible discounts.
      * In that case, use the bigger discount.
      */
    const currentDiscount = this.tx.discount || 0
    if (discount.discount > currentDiscount) {
      this.tx = Tx.update(this.tx, { discount: discount.discount, discountSource: source })
    }
  }
}

Brain.prototype._sendCoins = function _sendCoins () {
  this.browser().send({
    action: 'cryptoTransferPending',
    buyerAddress: coinUtils.formatAddress(this.tx.cryptoCode, this.tx.toAddress)
  })

  this._doSendCoins()
}

Brain.prototype._doSendCoins = function _doSendCoins () {
  const complianceStates = _.concat(COMPLIANCE_VERIFICATION_STATES, COMPLIANCE_REJECTED_STATES)
  if (this.state !== 'acceptingBills' && !_.includes(this.state, complianceStates)) return
  return this._executeSendCoins()
}

// This keeps trying until success
Brain.prototype._executeSendCoins = function _executeSendCoins () {
  emit('billValidatorPendingOff')
  this.disableBillValidator()

  this._verifyTransaction()

  const coin = _.find(['cryptoCode', this.tx.cryptoCode], this.trader.coins)

  if (coin.batchable) {
    return this.updateTx({batched: true})
      .then(tx => this._cashInComplete(tx))
      .catch(err => {
        this._sendCoinsError(err)
        this.tx = _.set('timedout', true, this.tx)
        this.saveTx(this.tx)
      })
  }

  return this.updateTx({ send: true })
    .then(tx => this._cashInComplete(tx))
    .catch(err => {
      this._sendCoinsError(err)
      this.tx = _.set('timedout', true, this.tx)
      this.saveTx(this.tx)
    })
}

// Giving up, go to special screens asking user to contact operator
Brain.prototype._sendCoinsError = function _sendCoinsError (err) {
  console.log('Error sending cryptos: %s', err.message)

  const withdrawFailureRec = {
    credit: this._uiCredit(),
    txId: this.tx.id
  }

  const self = this
  if (err.statusCode === INSUFFICIENT_FUNDS_CODE) {
    setTimeout(function () { self._idle() }, self.config.insufficientFundsTimeout)
    return this._transitionState('insufficientFunds', withdrawFailureRec)
  }
  
  this._transitionState('withdrawFailure', withdrawFailureRec)
  this._timeoutToIdle(60000)
}

// And... we're done!
Brain.prototype._cashInComplete = function _cashInComplete () {
  this._setState('completed')

  this.browser().send({
    action: 'cryptoTransferComplete',
    txId: this.tx.id
  })

  this._screenTimeout(this._completed.bind(this), this.config.completedTimeout)
}

Brain.prototype._sendSmsReceipt = function _sendSmsReceipt () {
  const customer = this.customer
  const data = {
    session: this.tx.id,
    txClass: this.tx.direction
  }

  this.browser().send({ smsReceiptStatus: 'printing' })
  this.trader.smsReceipt(data, customer.id)
    .then(() => this.browser().send({ smsReceiptStatus: 'success' }))
    .catch(() => {
      this.browser().send({ smsReceiptStatus: 'failed' })
      setTimeout(() => {
        this.browser().send({ smsReceiptStatus: 'available' })
      }, 2500)
    })
}

Brain.prototype._startPrintReceipt = function _startPrintReceipt () {
  this.browser().send({ receiptStatus: 'printing' })
  this._printReceipt()
    .then(() => this.browser().send({ receiptStatus: 'success' }))
    .catch(() => {
      this.browser().send({ receiptStatus: 'failed' })
      setTimeout(() => {
        this.browser().send({ receiptStatus: 'available' })
      }, 2500)
    })
}

Brain.prototype._printReceipt = function _printReceipt () {
  if (!this.printer) {
    console.log('[ERROR]: The kiosk printer is not loaded')
    return
  }

  const cashInCommission = BN(1).add(BN(this.tx.commissionPercentage))

  const rate = BN(this.tx.rawTickerPrice).mul(cashInCommission).round(2)
  const date = new Date()
  date.setMinutes(date.getMinutes() + parseInt(this.trader.timezone))

  const dateString = `${date.toISOString().replace('T', ' ').slice(0, 19)}`

  const data = {
    operatorInfo: this.trader.operatorInfo,
    location: deviceConfig.machineLocation,
    customer: this.customer ? this.customer.phone : 'Anonymous',
    session: this.tx.id,
    time: dateString,
    direction: this.tx.direction === 'cashIn' ? 'Cash-in' : 'Cash-out',
    fiat: `${this.tx.fiat.toString()} ${this.tx.fiatCode}`,
    crypto: `${this.toCryptoUnits(this.tx.cryptoAtoms, this.tx.cryptoCode)} ${this.tx.cryptoCode}`,
    rate: `1 ${this.tx.cryptoCode} = ${rate} ${this.tx.fiatCode}`,
    address: this.tx.toAddress,
    txId: this.tx.txHash
  }

  return this.printer.checkStatus(deviceConfig.kioskPrinter, STATUS_QUERY_TIMEOUT)
    .then(() => this.printer.printReceipt(data, deviceConfig.kioskPrinter, this.trader.receiptOptions))
    .catch((err) => {
      console.log('[ERROR]: The kiosk printer is in an invalid state.', err)
      throw err
    })
}

Brain.prototype._verifyTransaction = function _verifyTransaction () {
  if (!this.idVerify.inProgress()) return

  this.idVerify.addTransaction(this.tx)
  this.idVerify.verifyTransaction(function (err) { console.log(err) })
}

Brain.prototype._screenTimeoutHandler = function _screenTimeoutHandler (callback) {
  this.currentScreenTimeout = null
  callback()
}

Brain.prototype._screenTimeout = function _screenTimeout (callback, timeout) {
  const self = this

  if (this.currentScreenTimeout) {
    clearTimeout(this.currentScreenTimeout)
    this.currentScreenTimeout = null
  }

  this.currentScreenTimeout =
    setTimeout(function () { self._screenTimeoutHandler(callback) }, timeout)
}

Brain.prototype._timeoutToIdle = function _timeoutToIdle (timeout) {
  const self = this
  this._screenTimeout(function () { self._idle() }, timeout)
}

Brain.prototype._completed = function _completed () {
  if (this.state === 'goodbye' || this.state === 'maintenance') return
  if (this._isTestMode()) return this._testModeOff()

  emit('ledsOff')

  this._transitionState('goodbye')

  const elapsed = Date.now() - this.bootTime
  if (elapsed > this.config.exitTime) {
    console.log('Scheduled restart.')
    process.exit()
  }

  if (this.billValidatorErrorFlag) {
    this.emit('error', new Error('Bill validator error, exiting post transaction.'))
  }

  this._screenTimeout(() => this._idle(), this.config.goodbyeTimeout)
}

Brain.prototype._machine = function _machine () {
  this.browser().send({ action: 'machine', machineInfo: this.config.unit })
  this._setState('machine')
}

Brain.prototype._cancelMachine = function _cancelMachine () {
  this._idle()
}

Brain.prototype._powerOffButton = function _powerOffButton () {
  const self = this
  this.wifi.clearConfig(function () {
    self._powerOff()
  })
}

Brain.prototype._powerOff = function _powerOff () {
  this._setState('powerOff')
  console.log('powering off')
  cp.execFile('poweroff', ['-d', '2'], {}, function () {
    process.exit(0)
  })
}

Brain.prototype._reboot = function _reboot () {
  console.log('Remote reboot')
  cp.execFile('shutdown', ['-r', 'now'], {}, function () {
    process.exit(0)
  })
}

Brain.prototype._shutdown = function _shutdown () {
  // can only run if machine is no in the middle of a transaction
  if (!this.isStaticState()) {
    console.log('In the middle of a transaction. Will shutdown when it is done...')
    return
  }
  console.log('Remote shutdown')
  cp.execFile('shutdown', ['now'], {}, function () {
    process.exit(0)
  })
}

Brain.prototype._abortTransaction = function _abortTransaction () {
  this._idle()
}

Brain.prototype._setupCheckPower = function _setupCheckPower () {
  const self = this
  setInterval(function () {
    self._checkPower()
  }, this.config.checkPowerTime)
}

// This can only get called when we're not in a transaction
Brain.prototype._checkPower = function _checkPower () {
  if (!this.isStaticState()) return

  // TODO: factor this out to a device-specific module
  const powerStatusPath = this.config.powerStatus
  if (!powerStatusPath) return

  const self = this
  fs.readFile(powerStatusPath, { encoding: 'utf8' }, function (err, res) {
    if (err) {
      console.log(err.stack)
      return
    }
    if (res.match(/^Discharging/)) {
      console.log('Sensed power down.')
      self.powerDown = true
      const elapsed = Date.now() - self.lastPowerUp > self.config.checkPowerTimeout
      if (!elapsed) return
      console.log('Device unplugged. Powering down. Forgetting WiFi.')
      self._setState('powerDown')
      self.wifi.clearConfig(function () {
        self._powerOff()
      })
    }
    self.powerDown = false
    self.lastPowerUp = Date.now()
  })
}

Brain.prototype._restartServices = function _restartServices (reason, restartBrowser) {
  console.log('Going down [%s]...', reason)
  if (!restartBrowser) {
    return process.exit(0)
  }

  const command = this.determinePlatform === 'AAEON'
    ? 'killall chromium-browser' : 'supervisorctl restart lamassu-browser'

  cp.execFile(command, [], {}, function (msg) {
    console.log(msg)
    return process.exit(0)
  })
}

Brain.prototype._unpair = function _unpair () {
  if (!pairing.isPaired(this.connectionInfoPath)) return

  console.log('Unpairing')
  this.stop()
  pairing.unpair(this.connectionInfoPath)

  console.log('Unpaired. Rebooting...')
  this._setState('unpaired')
  this.browser().send({ action: 'unpaired' })
  db.clean(this.dbRoot)
  setTimeout(() => this._restartServices('Unpair'), 2000)
}

Brain.prototype._billValidatorErr = function _billValidatorErr (err) {
  if (!err) err = new Error('Bill Validator error')

  if (this.billValidatorErrorFlag) return // Already being handled

  if (this.tx && this.tx.bills.length > 0) {
    this.billValidatorErrorFlag = true
    this.disableBillValidator() // Just in case. If error, will get throttled.
    this.browser().send({ credit: this._uiCredit(), sendOnly: true, reason: 'validatorError' })
    return
  }

  if (this.powerDown) return

  this.billValidatorErrorFlag = true
}

Brain.prototype._getFiatButtonResponse = function _getFiatButtonResponse () {
  const tx = this.tx
  const cassettes = this.trader.cassettes
  const virtualCassettes = this.trader.virtualCassettes

  const txLimit = getAmountToHardLimit(this.trader.triggers, this.customerTxHistory, tx)
  const activeDenominations = Tx.computeCashOut(tx, cassettes, virtualCassettes, txLimit)

  return { tx, activeDenominations }
}

Brain.prototype._chooseFiat = function _chooseFiat () {
  const amount = this.complianceAmount()
  const triggerTx = { fiat: amount, direction: 'cashOut' }

  const response = this._getFiatButtonResponse()
  if (response.activeDenominations.isEmpty) return this._timedState('outOfCash')

  const nonCompliantTiers = this.nonCompliantTiers(this.trader.triggers, this.customerTxHistory, triggerTx)
  const isCompliant = _.isEmpty(nonCompliantTiers)

  if (!isCompliant) {
    return this.smsCompliance()
  }

  const txId = this.tx.id
  const cryptoCode = this.tx.cryptoCode
  const coin = _.find(['cryptoCode', cryptoCode], this.trader.coins)

  const updateRec = {
    direction: 'cashOut',
    fiatCode: this.fiatCode,
    commissionPercentage: BN(coin.cashOutCommission).div(100),
    rawTickerPrice: BN(coin.rates.bid)
  }

  const update = _.assignAll([this.tx, updateRec])

  this.tx = Tx.update(this.tx, update)

  this._transitionState('chooseFiat', {
    chooseFiat: response,
    isCashInOnlyCoin: coin.isCashInOnly,
    receiptStatus: this.trader.receiptPrintingActive ? 'available' : 'disabled'
  })
  const self = this
  this.dirtyScreen = false
  const interval = setInterval(function () {
    const doClear = self.state !== 'chooseFiat' ||
      self.tx.id !== txId
    if (doClear) return clearInterval(interval)

    const isDirty = self.dirtyScreen
    self.dirtyScreen = false
    if (isDirty) return
    clearInterval(interval)
    self._idle()
  }, 120000)
}

Brain.prototype._chooseFiatCancel = function _chooseFiatCancel () {
  this._idle()
}

Brain.prototype._fiatButtonResponse = function _fiatButtonResponse () {
  this.dirtyScreen = true
  const response = this._getFiatButtonResponse()
  this.browser().send({ fiatCredit: response })
}

Brain.prototype._fiatButton = function _fiatButton (data) {
  const denomination = parseInt(data.denomination, 10)
  const tx = this.tx

  const buttons = this._getFiatButtonResponse()
  const cryptoCode = tx.cryptoCode

  // We should always have enough available if the button could be pressed,
  // just double-checking

  if (buttons.activeDenominations.activeMap[denomination]) {
    // BACKWARDS_COMPATIBILITY 7.5.1
    const serverVersion = this.trader.serverVersion
    if (!serverVersion || semver.lt(serverVersion, '7.5.1-beta.0')) {
      const rate = this.trader.rates(cryptoCode).cashOut
      this.tx = Tx.addCashDeprecated(denomination, rate, this.tx)
    } else {
      this.tx = Tx.addCash(denomination, this.tx)
    }
  }

  this._fiatButtonResponse()
}

Brain.prototype._clearFiat = function _clearFiat () {
  const tx = this.tx

  tx.fiat = BN(0)
  tx.cryptoAtoms = BN(0)

  this._fiatButtonResponse()
}

Brain.prototype._sendSecurityCode = function _sendSecurityCode (number) {
  const self = this

  return this.trader.phoneCode(number)
    .then(result => {
      this.currentPhoneNumber = number
      this.currentSecurityCode = result.code
    })
    .catch(err => {
      if (err.name === 'BadNumberError') {
        return self._timedState('badPhoneNumber')
      }

      console.log(err.stack)
      return this._fiatError(err)
    })
}

Brain.prototype.exceedsZeroConf = function exceedsZeroConf (tx) {
  // ETH zeroConfLimit should always be 0, and as such always exceeds
  if (tx.cryptoCode === 'ETH') return true
  const coin = coinUtils.getCryptoCurrency(tx.cryptoCode)

  if (!coin) throw new Error('Fatal: unsupported coin: ' + tx.cryptoCode)
  return coin.zeroConf && tx.fiat.gte(this.trader.zeroConfLimits[tx.cryptoCode])
}

Brain.prototype._cashOut = function _cashOut () {
  const tx = this.tx
  const amount = tx.fiat
  const triggerTx = { fiat: amount, direction: tx.direction }

  const nonCompliantTiers = this.nonCompliantTiers(this.trader.triggers, this.customerTxHistory, triggerTx)
  const isCompliant = _.isEmpty(nonCompliantTiers)
  const doCompliance = this.exceedsZeroConf(tx) || !isCompliant || this.txBlockedByManualTrigger

  if (doCompliance) {
    return this.smsCompliance({ returnState: this.state })
  }

  return this.toDeposit()
}

Brain.prototype.toDeposit = function toDeposit () {
  const tx = this.tx
  this._transitionState('deposit', { tx })
  return this.commitCashOutTx()
}

Brain.prototype.toCryptoUnits = function toCryptoUnits (cryptoAtoms, cryptoCode) {
  const unitScale = coinUtils.getCryptoCurrency(cryptoCode).unitScale
  return cryptoAtoms.shift(-unitScale)
}

// User has deposited cryptos but we haven't received them after waiting
Brain.prototype._depositTimeout = function _depositTimeout () {
  this.tx.started = true

  if (this.tx.phone) {
    return this._redeemLater()
  }

  this.smsCompliance({ returnState: 'redeemLater', noCode: this.networkDown, reason: 'deposit_timeout' })
}

Brain.prototype.depositTimeoutNotSent = function depositTimeoutNotSent () {
  if (this.networkDown) return this._timedState('depositNetworkDown')
  this._cashOut()
}

Brain.prototype._redeemLater = function _redeemLater () {
  const updateP = this.networkDown
    ? this.fastUpdateTx({ redeem: true })
    : this.updateTx({ redeem: true })

  return updateP
    .then(() => this._timedState('redeemLater'))
    .catch(e => this._fiatError(e))
}

Brain.prototype._waitForDispense = function _waitForDispense (status) {
  const originalTx = this.tx
  return this.trader.waitForDispense(this.tx, status)
    .then(tx => {
      if (!tx) return
      if (this.tx.id !== tx.id) return

      return this._dispenseUpdate(tx)
    })
    .catch(err => {
      if (err.networkDown) this._networkDown()

      // prevent doing a fastupdateTx of the wrong tx
      if (originalTx.id !== this.tx.id) {
        return this._timedState('depositTimeout')
      }

      return this.fastUpdateTx({timedout: true})
        .then(() => {
          if (this.state !== 'areYouSure')
            this._timedState('depositTimeout')
        })
    })
}

Brain.prototype._fiatError = function _fiatError (err) {
  console.log('fiatError', err)
  const state = this.tx.started ? 'fiatTransactionError' : 'fiatError'
  this._timedState(state)
  return Promise.reject(err)
}

Brain.prototype._dispense = function _dispense () {
  if (commandLine.debugLogs)
    console.log('DEBUG: Attempting to dispense:', this.tx)
  return Promise.resolve()
    .then(() => {
      // safeguard against dispensing a broken tx record
      if (this.tx.cryptoAtoms.lte(0)) {
        throw new Error('Tried to dispense with 0 cryptoAtoms')
      }

      // check if dispense was already done
      if (this.tx.dispense || this.tx.dispenseConfirmed) {
        throw new Error('Already dispensed')
      }

      // mark this tx as dispense started
      return this.updateTx({ dispense: true })
    })

    // actual dispense
    .then(() => this._physicalDispense())

    // shit happens
    .catch(err => {
      console.log('_dispense error', err.stack)
      if (!this.billDispenser.initialized) {
        const cassettes = this.trader.cassettes

        // puloonrs232 port closing code waits 100ms before closing
        setTimeout(() => {
          return this.billDispenser.init({
            cassettes,
            fiatCode: this.trader.locale.fiatCode
          })
        }, 200)
      }
      if (err.statusCode === INSUFFICIENT_FUNDS_CODE) return this._timedState('outOfCash')
      return this._fiatError(err)
    })
}

Brain.prototype._batchDispense = function _batchDispense (notesToDispense, { batchAmount, dispenseRecords, currentBatch, error }) {
  // short circuit out if a error is found
  if (error) {
    return { dispenseRecords, error }
  }

  this.browser().send({ action: 'dispensing', dispenseBatch: { current: currentBatch, of: batchAmount } })
  const addDispensed = _.zipWith((a, b) => ({ dispensed: _.sumBy('dispensed', [a, b]), rejected: _.sumBy('rejected', [a, b]) }))

  return this.billDispenser.dispense(notesToDispense, currentBatch, batchAmount)
    .then(({ value, error }) => {
      const response = {
        batchAmount,
        batch: value,
        dispenseRecords: addDispensed(value, dispenseRecords),
        error,
        currentBatch: currentBatch + 1
      }

      // single batch dispense or error don't need to deal with other screens
      if (batchAmount === 1 || error) {
        return response
      }

      const screen = currentBatch === batchAmount ? 'dispensingCollect' : 'dispensingPartialCollect'
      this.browser().send({ action: screen, dispenseBatch: { current: currentBatch, of: batchAmount } })

      return this.billDispenser.waitForBillsRemoved()
        .then(() => response)
        .catch(error => _.assign(response, { error }))
    })
    .catch(error => ({ dispenseRecords, error }))
}

// handler that runs after all batches are dispensed
Brain.prototype._batchesFinished = function _batchesFinished ({ dispenseRecords, error }) {
  const tx = this.tx
  const bills = _.toArray(_.merge(tx.bills, dispenseRecords))

  const dispenseConfirmed = tx.fiat.eq(_.sumBy(it => it.denomination * it.dispensed, bills))
  if (dispenseConfirmed) emit({ action: 'billDispenserDispensed' })

  const fastUpdateTxEventDataErr = {
    error: error && _.join(' ', _.reject(_.isEmpty, [error.name, error.message, error.err, error.error, error.statusCode]))
  }

  const fastUpdateTxEventData = _.extend({ bills, dispenseConfirmed }, !dispenseConfirmed ? fastUpdateTxEventDataErr : {})
  this.fastUpdateTx(fastUpdateTxEventData)

  if (!dispenseConfirmed) {
    return this._timedState('outOfCash')
  }

  const toAddress = coinUtils.formatAddress(tx.cryptoCode, tx.toAddress)
  const displayTx = _.assign({ toAddress }, tx)

  this._transitionState('fiatComplete', { tx: displayTx, smsReceiptStatus: this.trader.smsReceiptActive && this.customer ? 'available' : 'disabled' })

  pDelay(this.config.completedTimeout).then(() => {
    emit({ action: 'billDispenserCollected' })
    if (tx.id !== _.get('id')(this.tx)) {
      return
    }
    return this._completed(tx.id)
  })
}

Brain.prototype._physicalDispense = function _physicalDispense () {
  const fiatCode = this.tx.fiatCode

  const notes = []
  _.forEach(it => notes.push(this.tx.bills[it].provisioned), _.times(_.identity(), this.numberOfCassettes))

  if (fiatCode !== this.billDispenser.fiatCode) {
    console.log('Wrong dispenser currency; dispenser: %s, tx: %s',
      this.billDispenser.fiatCode, fiatCode)
    return this._timedState('wrongDispenserCurrency')
  }

  this._transitionState('dispensing')
  emit('billDispenserDispensing')

  const notesToDispense = optimizeDispense(notes, this.billDispenser.dispenseLimit)
  const batchAmount = notesToDispense.length

  const initialParams = {
    notesToDispense,
    batchAmount,
    currentBatch: 1,
    dispenseRecords: _.map(() => ({ dispensed: 0, rejected: 0 }), _.times(_.identity(), this.numberOfCassettes))
  }

  // creates a promise array that runs in waterfall mode (sequentially passing response down)
  // batchAmount of dispenses (batchDispense) plus a final handler (batchesFinished)
  const batches = notesToDispense.reduce((acc, notes) => acc.then(it => this._batchDispense(notes, it)), Promise.resolve(initialParams))

  // use anonymous function to pass down scope
  batches.then(it => this._batchesFinished(it))
    .catch(err => {
      console.log(err)
      return this._idle()
    })
}

Brain.prototype._dispenseUpdate = function _dispenseUpdate (tx) {
  const overZeroConf = this.exceedsZeroConf(tx)
  const status = tx.status
  const needToRedeem = !_.includes(status, ['instant', 'confirmed']) && overZeroConf

  if (needToRedeem && tx.phone) return this._redeemLater()

  if (needToRedeem) {
    console.log('WARNING: This shouldn\'t happen; over zero-conf limit and not secured')
    return this._idle()
  }

  switch (status) {
    case 'rejected':
      this.smsCompliance({ returnState: 'redeemLater', reason: 'rejected_zero_conf' })
      break
    case 'published':
      this._transitionState('pendingDeposit')
      this._waitForDispense('published')
      break
    case 'authorized':
    case 'instant':
    case 'confirmed':
      this._dispense()
      break
  }
}

Brain.prototype._redeem = function _redeem () {
  this.redeem = true
  this.smsCompliance()
}

Brain.prototype._fiatReceipt = function _fiatReceipt () {
  const tx = this.tx
  const toAddress = coinUtils.formatAddress(tx.cryptoCode, tx.toAddress)
  const displayTx = _.set('toAddress', toAddress, tx)

  this._timedState('fiatReceipt', {
    data: { tx: displayTx },
    timeout: 120000
  })
}

Brain.prototype.areYouSureHandled = function areYouSureHandled (action) {
  return _.includes(action, ARE_YOU_SURE_HANDLED) ||
    (_.includes(action, ARE_YOU_SURE_SMS_HANDLED) &&
      _.includes(this.complianceReason, ARE_YOU_SURE_HANDLED_SMS_COMPLIANCE))
}

Brain.prototype.areYouSure = function areYouSure () {
  const currentState = this.state
  const timeoutHandler = () => this.cancelTransaction(currentState)
  this._timedState('areYouSure', { timeoutHandler })
}

Brain.prototype.continueTransaction = function continueTransaction (previousState) {
  if (previousState === 'deposit') return this.toDeposit()
  this._timedState(previousState)
}

Brain.prototype.cancelTransaction = function cancelTransaction (previousState) {
  switch (previousState) {
    case 'deposit':
      this.trader.cancelDispense(this.tx)
      this._idle()
      break
    case 'security_code':
    case 'register_phone':
      if (this.flow) {
        this.returnState = null
        this.flow.handle('cancelPhoneNumber')
      }
      break
    default :
      this.trader.cancelDispense(this.tx)
      this._idle()
  }
}

Brain.prototype.browser = function browser () {
  return this.browserObj
}

Brain.prototype.setBrowser = function setBrowser (obj) {
  this.browserObj = obj
}

function startsWithUSB (file) {
  return file.indexOf('ttyUSB') === 0
}

// This maps /sys style paths from USB hub positions to actual device paths
// Device paths are arbitrary, so we want to go by fixed hub positions, but
// node-serialport only takes device paths.
function determineDevicePath (path) {
  if (!path || path.indexOf('/sys/') !== 0) return path
  try {
    const files = fs.readdirSync(path)
    const device = _.find(startsWithUSB, files)
    return device ? '/dev/' + device : null
  } catch (e) {
    console.log('hub path not connected: ' + path)
    return null
  }
}

function pickBoardManager () {
  if (deviceConfig.cryptomatModel === 'sintra' && !deviceConfig.brain.hasSsuboard) {
    return require('./upboard/sintra/board-manager')
  }

  if (deviceConfig.cryptomatModel === 'tejo') {
    return require('./upboard/tejo/board-manager')
  }

  if (deviceConfig.brain.hasSsuboard) {
    return require('./ssuboard/board-manager')
  }

  if (deviceConfig.cryptomatModel === 'gaia') {
    return require('./upboard/gaia/board-manager')
  }

  return require('./ssuboard/mock/board-manager')
}

module.exports = Brain
