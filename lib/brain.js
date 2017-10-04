const fs = require('fs')
const cp = require('child_process')
const os = require('os')
const path = require('path')
const net = require('net')
const _ = require('lodash/fp')
const minimist = require('minimist')
const Rx = require('rxjs/Rx')
const pify = require('pify')
const pAny = require('p-any')
const pSettle = require('p-settle')

const sms = require('./flows/sms')
const coinUtils = require('./coins/utils')
const pairing = require('./pairing')
const Tx = require('./tx')
const BN = require('./bn')
const usbreset = require('./usbreset')
const version = require('../package.json').version
const db = require('./db')

const BigNumber = BN.klass
const commandLine = minimist(process.argv.slice(2))

let transitionTime

const BILL_ACCEPTING_STATES = ['billInserted', 'billRead', 'acceptingBills',
  'acceptingFirstBill', 'maintenance']
const NON_TX_STATES = ['networkDown', 'connecting', 'wifiConnected', 'pairing',
  'initializing', 'booting']
const INITIAL_STATE = 'start'
const MIN_SCREEN_TIME = 1000
const POLL_INTERVAL = commandLine.pollTime || 5000
const INSUFFICIENT_FUNDS_CODE = 570
const NETWORK_TIMEOUT_INTERVAL = 20000
const MIN_WAITING = 500

const Brain = function (config) {
  if (!(this instanceof Brain)) return new Brain(config)

  this.rootConfig = config
  this.config = config.brain

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
  } else {
    this.wifi = require('./wifi')(wifiConfig)
  }

  this.scanner = config.mockCam
  ? require('./mocks/scanner')
  : require('./scanner')
  this.scanner.config(config.scanner)

  config.id003.rs232.device = determineDevicePath(config.id003.rs232.device)
  config.billDispenser.device = determineDevicePath(config.billDispenser.device)
  if (config.id003Device) config.id003.rs232.device = config.id003Device

  config.id003.fiatCode = this.fiatCode
  const billValidatorClass = commandLine.mockBillValidator
  ? require('./mocks/id003')
  : require('./id003/id003')

  this.billValidator = billValidatorClass.factory(config.id003)

  this.setBrowser(require('./browser')())
  this._setState(INITIAL_STATE)
  this.tx = null
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
}

function platformDisplay (code) {
  if (code === 'N7G1') return 'Trofa'
  if (code === 'AAEON') return 'Douro'
  return osPlatform()
}

Brain.prototype.traderRun = function traderRun () {
  this.pollHandle = setInterval(() => {
    if (this.state === 'networkDown') this.trader.clearConfigVersion()
    this.trader.poll()
  }, POLL_INTERVAL)

  return this.trader.poll()
}

Brain.prototype.stop = function stop () {
  clearInterval(this.pollHandle)
}

Brain.prototype.prunePending = function prunePending (txs) {
  const pendingTxs = _.filter('dirty', txs)

  if (_.isEmpty(pendingTxs)) return 0

  const modifier = tx => tx.direction === 'cashIn'
  ? Tx.update(tx, {send: true, timedout: true})
  : Tx.update(tx, {timedout: true})

  // Since it's pending we want to send and not wait for more bills
  const promises = _.map(tx => this.postTx(modifier(tx)), pendingTxs)

  return Promise.all(promises)
  .then(() => pendingTxs.length)
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
  this._setUpN7()
  this.browser().listen(this.config.wsPort)
  usbreset.reset(this.config.resetBasePath, this.determinePlatform())
  this._periodicLog()

  const callback = function () {
    self._transitionState('restart')
    console.log('Scheduled restart after idle time.')
    process.exit()
  }

  this._executeCallbackAfterASufficientIdlePeriod(callback)

  this.clientCert = pairing.getCert(this.certPath)

  if (!this.clientCert) return this._transitionState('virgin')
  this.checkWifiStatus()
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

  function reporting () {
    const clauses = ['version: %s, cpuLoad: %s, memUse: %s, memFree: %s\n  nodeUptime: %s, ' +
    'osUptime: %s']

    const batteryPromises = _.map(path => readFile(path, {encoding: 'utf8'}), batteryCapacityPaths)
    const tempPromises = _.map(path => readFile(path, {encoding: 'utf8'}), tempSensorPaths)
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
      console.log(format, version, cpuLoad, memUse, memFree, nodeUptime, osUptime)
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
    if (err || status === 'bill') {
      if (err) console.log(err.stack)
      if (self.state !== 'wifiConnecting') self._wifiConnecting()
      self.wifi.waitConnection(function (err, ip) {
        if (err) {
          self.wifi.startScanning()
          self._wifiList()
          return
        }
        self.config.ip = ip
        self._wifiConnected()
      })
    } else if (status === 'disconnected') {
      self.wifi.startScanning()
      self._wifiList()
    } else if (status === 'connected') {
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
    self.browser().send({wifiList: res})
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
  this.trader.on('reboot', function () { self._restartService('Remote reboot') })
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

Brain.prototype._setUpN7 = function _setUpN7 () {
  const backlightPath = '/sys/class/backlight/pwm-backlight/brightness'
  if (fs.existsSync(backlightPath)) fs.writeFileSync(backlightPath, '160\n')
  this._setupWebcam()
  this._setupCheckPower()
}

Brain.prototype._connectedBrowser = function _connectedBrowser () {
  //  TODO: have to work on this: console.assert(this.state === State.IDLE)
  console.log('connected to browser')

  const wifiList = this.state === 'wifiList' && this.wifis
  ? this.wifis
  : []

  if (!this.trader || !this.trader.coins) {
    const rec = {
      action: this.state,
      wifiList,
      locale: 'en-US'
    }

    return this.browser().send(rec)
  }

  const cryptoCode = this.singleCrypto()
  ? this.trader.coins[0].cryptoCode
  : null

  const _rates = {
    rates: this.trader.rates(cryptoCode),
    cryptoCode: cryptoCode,
    coins: Tx.coins
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
    rates
  }

  this.browser().send(fullRec)
}

Brain.prototype._processRequest = function _processRequest (req) {
  if (this.flow) {
    return this.flow.handle(req.button, req.data)
  }

  this._processReal(req)
}

Brain.prototype._processReal = function _processReal (req) {
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
    case 'testMode':
      this._testMode()
      break
    case 'start':
      this._chooseCoin(req.data)
      break
    case 'idCode':
      this._idCode(req.data)
      break
    case 'cancelIdScan':
      this._cancelIdScan()
      break
    case 'cancelIdCode':
      this._cancelIdCode()
      break
    case 'idVerificationFailedOk':
    case 'idCodeFailedCancel':
    case 'idVerificationErrorOk':
      this._idle()
      break
    case 'idCodeFailedRetry':
      this._transitionState('idCode')
      break
    case 'cancelScan':
      this._cancelScan()
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
    case 'depositCancel':
      this.trader.cancelDispense()
      this._idle()
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
    case 'smsCompliance':
      const returnState = this.tx.fiat.eq(0)
      ? 'acceptingFirstBill'
      : 'acceptingBills'
      this.smsCompliance({returnState})
      break
    case 'blockedCustomerOk':
      this._idle()
      break
  }
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
  this.browser().send({action: 'lockedPass'})
}

Brain.prototype._unlock = function _unlock () {
  this._wifiList()
}

Brain.prototype._cancelLockPass = function _cancelLockPass () {
  this._setState('locked', 'lockedPass')
  this.browser().send({action: 'locked'})
}

Brain.prototype._wifiList = function _wifiList () {
  this._setState('wifiList')
  this.browser().send({action: 'wifiList'})
}

Brain.prototype._wifiPass = function _wifiPass (data) {
  this.browser().send({action: 'wifiPass', wifiSsid: data})
  this.wifi.stopScanning()
  this._setState('wifiPass')
  console.log('connecting to %s', data.ssid)
}

Brain.prototype._wifiConnect = function _wifiConnect (data) {
  this._setState('wifiConnecting', 'wifiPass')
  this.browser().send({action: 'wifiConnecting'})
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
  this.browser().send({action: 'wifiList'})
  this.wifi.startScanning()
  this._setState('wifiList', 'wifiPass')
}

Brain.prototype._wifiConnecting = function _wifiConnecting () {
  this._setState('wifiConnecting')
  this.browser().send({action: 'wifiConnecting'})
}

Brain.prototype._wifiConnected = function _wifiConnected () {
  if (this.state === 'maintenance') return
  this._setState('wifiConnected')
  this.initTrader()
}

Brain.prototype._unpaired = function _unpaired () {
  this._setState('unpaired')
  this.browser().send({action: 'unpaired'})
}

Brain.prototype._pairingScan = function _pairingScan () {
  this._setState('pairingScan')
  this.browser().send({action: 'pairingScan'})

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
    this.trader = require('./mocks/trader')(protocol, this.clientCert, connectionInfo)
  } else {
    this.trader = require('./trader')(protocol, this.clientCert, connectionInfo)
  }

  this.idVerify = require('./compliance/id_verify').factory({trader: this.trader})

  this._initTraderEvents()

  return this.traderRun()
  .then(() => this.initValidator())
}

Brain.prototype._pair = function _pair (totem) {
  const self = this
  this._transitionState('pairing')

  const model = platformDisplay(this.determinePlatform())
  return pairing.pair(totem, this.clientCert, this.connectionInfoPath, model)
  .then(() => this.activate())
  .catch(err => {
    console.log(err.stack)
    self._pairingError(err)
  })
}

Brain.prototype._pairingError = function _pairingError (err) {
  this._setState('pairingError')
  this.browser().send({action: 'pairingError', err: err.message})
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
    self._transitionState('virgin')
  })
}

function buildUiCassettes (cassettes, virtualCassettes) {
  const result = _.cloneDeep(cassettes)

  // TODO: Generalize, if we ever need more than 1 virtual cassette
  result.push({denomination: virtualCassettes[0], count: null})
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
  const self = this

  return this.billValidator.run(function (err) {
    if (err) return self._billValidatorErr(err)

    console.log('Bill validator connected.')
  })
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

  this.billValidator.lightOff()
  this.billValidator.disable()

  if (this.networkDown) return this._forceNetworkDown()

  this.idVerify.reset()
  this.currentPhoneNumber = null
  this.currentSecurityCode = null
  this.numCoins = this.trader.coins.length
  this.tx = Tx.newTx()
  this.bill = null
  this.lastRejectedBillFiat = null

  /**
   * Clear any data from previously
   * validated customers (id & dailyVolume)
   */
  this.customer = null

  this._setState('pendingIdle')

  // We've got our first contact with server

  const localeInfo = _.cloneDeep(this.localeInfo)
  locale = locale || localeInfo.primaryLocale
  localeInfo.primaryLocale = locale

  this.localeInfo = localeInfo

  this.beforeIdleState = false
  this.trader.clearConfigVersion()

  this.tx = Tx.update(this.tx, {fiatCode: this.fiatCode})

  if (this.trader.twoWayMode) {
    this._idleTwoWay(self.localeInfo)
  } else {
    this._idleOneWay(self.localeInfo)
  }
}

Brain.prototype.singleCrypto = function singleCrypto () {
  return this.trader.coins.length === 1
}

Brain.prototype.twoWayMode = function twoWayMode () {
  return this.trader.twoWayMode
}

/**
 * Check if the customer is blocked
 *
 * That happens if the customer has reached
 * one of the enabled compliance types threshold
 * and has the relevant override status to blocked
 *
 * @name isBlocked
 * @function
 *
 * @param {object} customer Acting customer
 * @returns {bool} Whether customer is blocked or not
 */
Brain.prototype.isBlocked = function isBlocked (customer) {
  const typeNames = [
    'sms',
    'sanctions',
    'authorized',
    'idCardData',
    'idCardPhoto',
    'frontCamera'
  ]

  return _.some(type => {
    // Don't check thresholds when the field is authorized
    if (type === 'authorized') return customer[type + 'Override'] === 'blocked'
    // If the compliance type status is off (by operator),
    // customer is not considered blocked
    if (!this.trader[type + 'VerificationActive']) return false
    const threshold = this.trader[type + 'VerificationThreshold'] || 0
    const exceedsThreshold = this.getUsersDailyVolume()
    .add(this.lastRejectedBillFiat)
    .gte(threshold)

    const isComplianceTypeBlocked = customer[type + 'Override'] === 'blocked'

    return exceedsThreshold && isComplianceTypeBlocked
  }, typeNames)
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
Brain.prototype.showBlockedCustomer = function showBlockedCustomer (customer) {
  // Current transaction's fiat not including current bill
  const insertedBills = this.tx.fiat.gt(BN(0))
  if (!insertedBills) {
    return this._transitionState('blockedCustomer', {insertedBills})
  }
  /*
   * Set acceptingBills as transition so that sendOnly
   * reason message would be displayed on that screen
   */
  this.updateBillScreen()
  return this.browser().send({
    sendOnly: true,
    reason: 'blockedCustomer',
    cryptoCode: this.tx.cryptoCode
  })
}

Brain.prototype.smsCompliance = function smsCompliance (opts = {}) {
  const returnState = opts.returnState
  const flow = new sms.Flow({noCode: opts.noCode})
  this.flow = flow

  flow.on('screen', rec => {
    this._transitionState(rec.screen, {context: 'compliance'})
  })

  flow.on('idle', () => {
    this.flow = null
    this._idle()
  })

  flow.on('sendCode', phone => {
    this.trader.phoneCode(phone.phone)
    .then(result => {
      this.customer = result.customer
      this.tx = Tx.update(this.tx, {customerId: result.customer.id})
      /*
       * Check to see if customer is blocked
       * and show the relative screen
       */
      if (this.isBlocked(this.customer)) {
        this.flow = null
        return this.showBlockedCustomer()
      }
      return flow.handle('requiredSecurityCode', result.code)
    })
    .catch(err => {
      if (err.name === 'BadNumberError') {
        return flow.handle('badPhoneNumber')
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
      this.smsFlowHandleReturnState(opts)
    })
  })

  flow.on('success', () => {
    const phone = flow.phone
    this.flow = null

    const txPromise = opts.redeem
    ? this.trader.fetchPhoneTx(phone)
    : Promise.resolve(Tx.update(this.tx, {phone}))

    return txPromise
    .then(tx => {
      this.tx = tx
      return this.smsFlowHandleReturnState(opts)
    })
    .catch(err => {
      if (err.statusCode === 404) {
        return this._timedState('unknownPhoneNumber')
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

    if (returnState) return this.smsFlowHandleReturnState(opts)
    this._idle()
  })

  flow.handle('start')
}

Brain.prototype.smsFlowHandleReturnState = function smsFlowHandleReturnState (opts) {
  const returnState = opts.returnState
  const tx = this.tx

  if (opts.redeem) {
    return this._dispenseUpdate(tx)
  }

  if (!returnState) return this.startScreen()

  /**
   * Return to idle state only if the pre-sms flow state was
   * acceptingFirstBill and sms flow failed at some point.
   * Otherwise if sms registration was successfull,
   * redirect user to insert the first bill (see below on transition)
   */
  if (returnState === 'acceptingFirstBill' && _.isNil(tx.phone)) {
    return this._idle()
  }

  if (returnState === 'chooseFiat') {
    if (_.isNil(tx.phone)) return this._chooseFiat()

    // Phone validation succeeded
    this._transitionState('deposit', {tx})
    this.commitCashOutTx()
    return
  }

  if (returnState === 'acceptingBills') {
    /**
     * If a network error occured during sms compliance authorization,
     * return to acceptingBills first, and then call _networkDown()
     * to display the networkDown reason instantly,
     * instead of showing networkDown screen
     */
    this.updateBillScreen()
    if (this.networkDown) this._networkDown()
    return
  }

  if (returnState === 'redeemLater') {
    return this._redeemLater()
  }

  this._transitionState(returnState)
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
Brain.prototype.completeBillHandling = function completeBillHandling () {
  // Available cryptocurrency balance expressed in fiat
  const availableCryptoAsFiat = this.balance().sub(this.tx.fiat)
  const highestBill = this.billValidator.highestBill(availableCryptoAsFiat)
  const hasLowBalance = highestBill.lte(0)

  /**
   * In case of transactionLimit error, usersTotalDailyVolume must me at least
   * 1 bill less than the limit to allow more transaction(s)
   * Otherwise, if even the minimum allowed bill doesn't fit,
   * show the transactionLimit error.
   */
  const usersTotalDailyVolume = this.getUsersDailyVolume()
  const exceededTxLimit = usersTotalDailyVolume
    .add(this.billValidator.lowestBill(BN(0)))
    .gt(this.trader.hardLimitVerificationThreshold)

  // SendOnly flag shows the user that no more bills are accepted
  // If the reason is transactionLimit or lowBalance, sendOnly should be true
  const sendOnly = exceededTxLimit || hasLowBalance

  // Provide the reason of bill rejection (if any).
  // If it is not a transactionLimit, client defaults to lowBalance
  const reason = exceededTxLimit ? 'transactionLimit' : false

  if (sendOnly) {
    this.billValidator.disable()
  }

  this.browser().send({
    credit: this._uiCredit(),
    sendOnly,
    reason,
    cryptoCode: this.tx.cryptoCode
  })
}

Brain.prototype.startScreen = function startScreen () {
  const direction = this.tx.direction

  const cashInBillExceedsThreshold = this.trader.smsVerificationActive &&
  this.billValidator.lowestBill(this.tx.fiat).gte(this.trader.smsVerificationThreshold) &&
  direction === 'cashIn'

  const nonCompliant = _.isNil(this.tx.phone)

  if (cashInBillExceedsThreshold && nonCompliant) {
    return this.smsCompliance()
  }

  if (direction === 'cashOut') return this._chooseFiat()
  if (direction === 'cashIn') return this._start()

  throw new Error(`No such direction ${direction}`)
}

Brain.prototype._idleTwoWay = function _idleTwoWay (localeInfo) {
  const self = this
  const cassettes = this.trader.cassettes
  const virtualCassettes = this.trader.virtualCassettes
  const uiCassettes = buildUiCassettes(cassettes, virtualCassettes)
  this.uiCassettes = uiCassettes

  if (!this.billDispenser) {
    this.billDispenser = this.rootConfig.mockBillDispenser
    ? require('./mocks/billdispenser').factory(this.rootConfig.billDispenser)
    : require('./billdispenser').factory(this.rootConfig.billDispenser)
  }

  if (!this.billDispenser.initialized) this._transitionState('booting')
  if (this.billDispenser.initializing) return

  this.billDispenser.init({
    cassettes,
    fiatCode: this.trader.locale.fiatCode
  }, function () {
    self._chooseCoinScreen(localeInfo, uiCassettes)
  })
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
  this.tx = Tx.update(this.tx, data)
  this.browser().send({cryptoCode: data.cryptoCode})
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

Brain.prototype._start = function _start () {
  if (this.startDisabled) return
  if (this.isLowBalance()) return this._timedState('balanceLow')

  const cryptoCode = this.tx.cryptoCode
  const coin = _.find(['cryptoCode', cryptoCode], this.trader.coins)
  const updateRec = {
    direction: 'cashIn',
    cashInFee: coin.cashInFee,
    minimumTx: this.billValidator.lowestBill(coin.minimumTx),
    cryptoNetwork: coin.cryptoNetwork
  }
  const update = _.assignAll([this.tx, updateRec])
  this.tx = Tx.update(this.tx, update)
  this._startAddressScan()
  this.browser().send({tx: this.tx})
}

Brain.prototype._startIdScan = function _startIdScan () {
  const self = this
  const txId = this.tx.id
  this._transitionState('scanId', {beep: true})
  this.idVerify.reset()
  this.billValidator.lightOn()

  this.scanner.scanPDF417(function (err, result) {
    self.startDisabled = false
    self.billValidator.lightOff()
    clearTimeout(self.screenTimeout)

    if (err) throw err
    const startState = _.includes(self.state, ['scanId', 'goodbye'])
    const freshState = self.tx.id === txId && startState
    if (!freshState) return
    if (!result) return self._idle()
    self.idVerify.addLicense(result)
    self._verifyId({beep: true})
  })
  this.screenTimeout = setTimeout(function () {
    if (self.state !== 'scanId') return
    self.scanner.cancel()
  }, this.config.qrTimeout)
}

Brain.prototype._cancelIdScan = function _cancelIdScan () {
  this.startDisabled = true
  this._bye()
  this.scanner.cancel()
}

Brain.prototype._cancelIdCode = function _cancelIdCode () {
  this._idle()
}

function gcd (a, b) {
  if (b) return gcd(b, a % b)
  return Math.abs(a)
}

Brain.prototype._startAlternatingLight = function _startAlternatingLight () {
  const self = this
  let lastState = 'on'
  const onInterval = this.config.scanLightOnInterval
  const offInterval = this.config.scanLightOffInterval
  const smallInterval = gcd(onInterval, offInterval)
  const onSkip = onInterval / smallInterval
  const offSkip = offInterval / smallInterval
  let count = 0

  if (!onInterval) return
  if (!offInterval) return this.billValidator.lightOn()

  this.billValidator.lightOn()
  this.alternatingLightTimer = setInterval(function () {
    count++
    if (lastState === 'off') {
      if (offSkip && count < offSkip) return
      self.billValidator.lightOn()
      lastState = 'on'
    } else {
      if (onSkip && count < onSkip) return
      self.billValidator.lightOff()
      lastState = 'off'
    }
    count = 0
  }, smallInterval)
}

Brain.prototype._stopAlternatingLight = function _stopAlternatingLight () {
  clearInterval(this.alternatingLightTimer)
  this.billValidator.lightOff()
}

Brain.prototype._startAddressScan = function _startAddressScan () {
  this._transitionState('scanAddress')
  const self = this
  const txId = this.tx.id

  this._startAlternatingLight()
  this.scanner.scanMainQR(this.tx.cryptoCode, function (err, address) {
    self._stopAlternatingLight()
    clearTimeout(self.screenTimeout)
    self.startDisabled = false

    if (err) self.emit('error', err)
    const startState = _.includes(self.state, ['scanAddress', 'goodbye'])
    const freshState = self.tx.id === txId && startState

    if (!freshState) return
    if (!address) return self._idle()
    self._handleScan(address)
  })
  this.screenTimeout = setTimeout(function () {
    if (self.state !== 'scanAddress') return
    self.scanner.cancel()
  }, this.config.qrTimeout)
}

Brain.prototype._verifyId = function _verifyId (options) {
  const beep = options && options.beep
  this._transitionState('verifyingId', {beep: beep})
  const self = this

  return this.idVerify.verifyUser()
  .then(result => {
    if (result.success) return self._firstBill()

    // The rest of these screens require user input and need a timeout
    let nextState
    if (result.errorCode === 'codeMismatch') {
      nextState = 'idCodeFailed'
    } else {
      nextState = 'idVerificationFailed'
    }

    this._transitionState(nextState)
    this._screenTimeout(self._restart.bind(self), self.config.confirmTimeout)
  })
  .catch(err => {
    console.log(err.stack)

    // The rest of these screens require user input and need a timeout
    const nextState = 'idVerificationError'
    this._transitionState(nextState)
    this._screenTimeout(self._restart.bind(self), self.config.confirmTimeout)
  })
}

Brain.prototype._idCode = function _idCode (code) {
  if (code === null) return this._idle()    // Timeout
  const paddedCode = String('0000' + code).slice(-4)  // Pad with zeros
  this.idVerify.addLicenseCode(paddedCode)
  this._verifyId()
}

Brain.prototype._bye = function _bye () {
  this._timedState('goodbye')
  console.trace('goodbye')
}

Brain.prototype._cancelScan = function _cancelScan () {
  this.startDisabled = true
  this._bye()
  this.scanner.cancel()
}

Brain.prototype._cancelInsertBill = function _cancelInsertBill () {
  this._idle()
  this.billValidator.disable()
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
      coins: Tx.coins
    },
    coins: this.trader.coins,
    twoWayMode: this.twoWayMode()
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

  this.billValidator.disable()
  this.browser().send({sendOnly: true, reason: 'networkDown'})
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
  const handler = opts.revertState
  ? function () { self._transitionState(opts.revertState) }
  : function () { self._idle() }

  this._transitionState(state, opts.data)
  this._screenTimeout(handler, timeout)
}

Brain.prototype._transitionState = function _transitionState (state, auxData) {
  // TODO refactor code to use this
  // If we're in maintenance state, we stay there till we die
  if (this.state === state || this.state === 'maintenance') return false
  const rec = {action: state}
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

Brain.prototype.beep = function beep () {
  this.browser().send({beep: true})
}

Brain.prototype._handleScan = function _handleScan (address) {
  this.beep()

  const waitingTimeout = setTimeout(() => {
    this._transitionState('cashInWaiting')
  }, MIN_WAITING)

  const t0 = Date.now()

  return this.updateTx({toAddress: address})
  .then(() => {
    clearTimeout(waitingTimeout)

    const elapsed = Date.now() - t0
    const extraTime = MIN_WAITING * 2 - elapsed
    const remaining = this.state === 'cashInWaiting'
    ? Math.max(0, extraTime)
    : 0

    const checkId = this.trader.idVerificationEnabled

    setTimeout(() => {
      if (checkId) return this._startIdScan()
      return this._firstBill()
    }, remaining)
  })
}

Brain.prototype._firstBill = function _firstBill () {
  this._setState('acceptingFirstBill')
  this.browser().send({action: 'scanned', buyerAddress: this.tx.toAddress})
  this.billValidator.enable()
  this._screenTimeout(() => this._idle(), this.config.billTimeout)
}

// Bill validating states

Brain.prototype._billInserted = function _billInserted () {
  this.browser().send({action: 'acceptingBill'})
  this._setState('billInserted')
}

/**
 * Get user's daily total volume.
 *
 * Total volume is the sum of current transactions amount
 * and the total amount user transacted the last day
 * (if the user is verified).
 *
 * @returns {BigNumber} Use's total volume in fiat
 */
Brain.prototype.getUsersDailyVolume = function getUsersDailyVolume () {
  // Current transaction's fiat not including current bill
  const fiatBeforeBill = this.tx.fiat

  // Volume that user transacted before this transaction,
  // including previous transactions' volume if user is identified
  const usersDailyVolumeBeforeTx = this.customer && this.customer.dailyVolume
    ? BN(this.customer.dailyVolume)
    : BN(0)

  // The total value user has transacted including the current transaction
  const usersTotalDailyVolume = usersDailyVolumeBeforeTx.add(fiatBeforeBill)
  return usersTotalDailyVolume
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

  // Get user's daily total volume
  const usersTotalDailyVolume = this.getUsersDailyVolume()

  // Available cryptocurrency balance expressed in fiat not including current bill
  const availableCryptoBeforeBillAsFiat = this.balance().sub(fiatBeforeBill)

  // Remaining fiat to insert. Not including the current bill
  const remainingFiatBeforeBill = this.trader.hardLimitVerificationThreshold.sub(usersTotalDailyVolume)

  // Max tx size is the lesser of these two limits
  const remainingFiatToInsert = BigNumber.min(availableCryptoBeforeBillAsFiat, remainingFiatBeforeBill)

  // Minimum allowed transaction
  const minimumAllowedTx = this.tx.minimumTx

  if (remainingFiatToInsert.lt(currentBill)) {
    billValidator.reject()

    const reason = remainingFiatBeforeBill.lte(availableCryptoBeforeBillAsFiat)
    ? 'transactionLimit'
    : 'lowBalance'

    const highestBill = billValidator.highestBill(remainingFiatToInsert)

    if (highestBill.lte(0)) {
      console.log('DEBUG: low balance, attempting disable')
      billValidator.disable()
      this.browser().send({
        sendOnly: true,
        cryptoCode: this.tx.cryptoCode
      })

      return
    }

    this.browser().send({
      action: 'highBill',
      highestBill: highestBill.toNumber(),
      reason: reason
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

  // If threshold is 0,
  // the sms verification is being handled at the beginning of this.startScreen.
  if (_.isNil(this.tx.phone) &&
     this.trader.smsVerificationActive &&
     fiatAfterBill.gte(this.trader.smsVerificationThreshold)) {
    // Cancel current bill
    this.billValidator.reject()
    this.browser().send({
      action: 'smsVerification',
      threshold: this.trader.smsVerificationThreshold

    })
    return
  }

  this.browser().send({
    action: 'acceptingBill',
    readingBill: currentBill.toNumber()
  })

  this._setState('billRead')

  billValidator.stack()
}

Brain.prototype.saveTx = function saveTx (tx) {
  return db.save(this.dbRoot, tx)
}

Brain.prototype.postTx = function postTx (tx) {
  const postTxF = timedout => {
    const updatedTx = _.assign(tx, {timedout})

    return this.trader.postTx(updatedTx)
    .then(serverTx => ({tx: serverTx}))
  }

  const timeout$ = Rx.Observable.timer(NETWORK_TIMEOUT_INTERVAL)
  .mapTo({timedout: true})
  .startWith({timedout: false})
  .share()

  const source$ = Rx.Observable.interval(POLL_INTERVAL)
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

// Don't wait for server response
Brain.prototype.fastUpdateTx = function fastUpdateTx (updateTx) {
  const newTx = Tx.update(this.tx, updateTx)
  this.tx = newTx

  this.postTx(newTx)
  .catch(err => console.log(err))

  return this.saveTx(newTx)
}

Brain.prototype.commitCashOutTx = function commitCashOutTx () {
  return this.sendCashOutTx()
  .then(ntx => {
    const amountStr = this.toCryptoUnits(ntx.cryptoAtoms, ntx.cryptoCode).toString()
    const depositUrl = coinUtils.depositUrl(ntx.cryptoCode, ntx.toAddress, amountStr)
    this._waitForDispense('notSeen')
    return this.browser().send({depositInfo: ntx, depositUrl})
  })
  .catch(err => this._fiatError(err))
}

Brain.prototype.sendCashOutTx = function sendCashOutTx (tx) {
  return this.updateTx({})
}

Brain.prototype.updateBillScreen = function updateBillScreen () {
  const bill = this.bill

  // No going back
  this.clearBill()

  const billUpdate = Tx.billUpdate(bill)

  return this.fastUpdateTx(billUpdate)
  .then(() => {
    this._transitionState('acceptingBills', {tx: this.tx})
    this._screenTimeout(() => this._sendCoins(), this.config.billTimeout)
  })
  .then(() => this.completeBillHandling())
}

// TODO: clean this up
Brain.prototype._billRejected = function _billRejected () {
  const self = this
  if (!_.includes(this.state, BILL_ACCEPTING_STATES)) return

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
    this.billValidator.enable()
  }
}

Brain.prototype._billJam = function _billJam () {
  // TODO FIX: special screen and state for this
  this.browser().send({action: 'networkDown'})
}

Brain.prototype._billsEnabled = function _billsEnabled (data) {
  console.log('Bills enabled codes: 0x%s, 0x%s', data.data1.toString(16),
    data.data2.toString(16))
}

Brain.prototype._stackerOpen = function _stackerOpen () {}

Brain.prototype._uiCredit = function _uiCredit () {
  const updatedBill = Tx.billUpdate(this.bill)
  const tx = Tx.update(this.tx, updatedBill)

  return {
    cryptoCode: tx.cryptoCode,
    fiat: tx.fiat.toNumber(),
    cryptoAtoms: tx.cryptoAtoms.toNumber(),
    lastBill: _.last(tx.bills.map(bill => bill.fiat.toNumber()))
  }
}

/**
 * Clear the rejected bill and keep it's
 * amount as the lastRejectedBillFiat
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
  const exchangeRate = this.trader.rates(cryptoCode).cashIn

  this.bill = Tx.createBill(bill, exchangeRate, this.tx)
}

Brain.prototype._sendCoins = function _sendCoins () {
  this.browser().send({
    action: 'cryptoTransferPending',
    buyerAddress: this.tx.toAddress
  })

  if (this.state === 'acceptingBills') this._doSendCoins()
}

Brain.prototype._doSendCoins = function _doSendCoins () {
  if (this.state !== 'acceptingBills') return
  return this._executeSendCoins()
}

// This keeps trying until success
Brain.prototype._executeSendCoins = function _executeSendCoins () {
  this.billValidator.disable()

  this._verifyTransaction()

  return this.updateTx({send: true})
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
    return this._transitionState('insufficientFunds')
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

  this._transitionState('goodbye')

  const elapsed = Date.now() - this.bootTime
  if (elapsed > this.config.exitTime) {
    console.log('Scheduled restart.')
    process.exit()
  }

  if (this.billValidatorErrorFlag) {
    this._transitionState('maintenance')
    this.emit('error', new Error('Bill validator error, exiting post transaction.'))
  }

  this._screenTimeout(() => this._idle(), this.config.goodbyeTimeout)
}

Brain.prototype._machine = function _machine () {
  this.browser().send({action: 'machine', machineInfo: this.config.unit})
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
  fs.readFile(powerStatusPath, {encoding: 'utf8'}, function (err, res) {
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

Brain.prototype._restartService = function _restartService (reason) {
  console.log('Going down [%s]...', reason)
  return process.exit(0)
}

Brain.prototype._unpair = function _unpair () {
  if (!pairing.isPaired(this.connectionInfoPath)) return

  console.log('Unpairing')
  this.stop()
  pairing.unpair(this.connectionInfoPath)

  console.log('Unpaired. Rebooting...')
  this._setState('unpaired')
  this.browser().send({action: 'unpaired'})
  setTimeout(() => this._restartService('Unpair'), 2000)
}

Brain.prototype._billValidatorErr = function _billValidatorErr (err) {
  const self = this
  if (!err) err = new Error('Bill Validator error')

  if (this.billValidatorErrorFlag) return // Already being handled

  if (this.tx && this.tx.bills.length > 0) {
    this.billValidatorErrorFlag = true
    this.billValidator.disable() // Just in case. If error, will get throttled.
    this.browser().send({credit: this._uiCredit(), sendOnly: true, reason: 'validatorError'})
    return
  }

  if (this.powerDown) return
  self._transitionState('maintenance')
  setTimeout(function () { self.emit('error', err) }, 15000)
}

Brain.prototype._getFiatButtonResponse = function _getFiatButtonResponse () {
  const tx = this.tx
  const cassettes = this.trader.cassettes
  const virtualCassettes = this.trader.virtualCassettes
  const txLimit = this.trader.hardLimitVerificationThreshold
  const activeDenominations = Tx.computeCashOut(tx, cassettes, virtualCassettes, txLimit)

  return {tx, activeDenominations}
}

Brain.prototype._chooseFiat = function _chooseFiat () {
  const txId = this.tx.id
  this.tx = Tx.update(this.tx, {fiatCode: this.fiatCode, direction: 'cashOut'})

  const response = this._getFiatButtonResponse()
  if (response.activeDenominations.isEmpty) return this._timedState('outOfCash')

  this._transitionState('chooseFiat', {chooseFiat: response})
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
  this.browser().send({fiatCredit: response})
}

Brain.prototype._fiatButton = function _fiatButton (data) {
  const denomination = parseInt(data.denomination, 10)
  const tx = this.tx

  const buttons = this._getFiatButtonResponse()
  const cryptoCode = tx.cryptoCode

  // We should always have enough available if the button could be pressed,
  // just double-checking
  const rate = this.trader.rates(cryptoCode).cashOut

  if (buttons.activeDenominations.activeMap[denomination]) {
    this.tx = Tx.addCash(denomination, rate, this.tx)
  }

  this._fiatButtonResponse()
}

Brain.prototype._clearFiat = function _clearFiat () {
  const tx = this.tx

  tx.fiat = BN(0)
  tx.cryptoAtoms = BN(0)

  this._fiatButtonResponse()
}

Brain.prototype._registerCode = function _registerCode () {
  this._transitionState('registerCode')
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
  const coin = Tx.coins[tx.cryptoCode]

  if (!coin) throw new Error('Fatal: unsupported coin: ' + tx.cryptoCode)

  return coin.zeroConf && tx.fiat.gt(this.trader.zeroConfLimit)
}

Brain.prototype._cashOut = function _cashOut () {
  const tx = this.tx

  if (this.exceedsZeroConf(tx) && !tx.phone) {
    return this.smsCompliance({returnState: this.state})
  }

  if (this.trader.smsVerificationActive &&
      tx.fiat.gte(this.trader.smsVerificationThreshold)) {
    return this.smsCompliance({returnState: this.state})
  }

  this._transitionState('deposit', {tx})
  return this.commitCashOutTx()
}

Brain.prototype.toCryptoUnits = function toCryptoUnits (cryptoAtoms, cryptoCode) {
  const unitScale = Tx.coins[cryptoCode].unitScale
  return cryptoAtoms.shift(-unitScale)
}

// User has deposited cryptos but we haven't received them after waiting
Brain.prototype._depositTimeout = function _depositTimeout () {
  this.tx.started = true

  if (this.tx.phone) {
    return this._redeemLater()
  }

  this.smsCompliance({returnState: 'redeemLater', noCode: this.networkDown})
}

Brain.prototype.depositTimeoutNotSent = function depositTimeoutNotSent () {
  if (this.networkDown) return this._timedState('depositNetworkDown')
  this._cashOut()
}

Brain.prototype._redeemLater = function _redeemLater () {
  const updateP = this.networkDown
  ? this.fastUpdateTx({redeem: true})
  : this.updateTx({redeem: true})

  return updateP
  .then(() => this._timedState('redeemLater'))
  .catch(e => this._fiatError(e))
}

Brain.prototype._waitForDispense = function _waitForDispense (status) {
  return this.trader.waitForDispense(this.tx, status)
  .then(tx => {
    console.log('DEBUG800')

    if (!tx) return

    console.log('DEBUG801')

    if (this.tx.id !== tx.id) return

    console.log('DEBUG802')

    return this._dispenseUpdate(tx)
  })
  .catch(err => {
    console.log('DEBUG803')
    if (err.networkDown) this._networkDown()

    return this.fastUpdateTx({timedout: true})
    .then(() => this._timedState('depositTimeout'))
  })
}

function fullDispense (tx) {
  const total = _.sumBy(bill => bill.denomination * bill.dispensed, tx.bills)
  return tx.fiat.eq(total)
}

function fillInBills (tx, bills) {
  const len = bills.length
  for (let i = 0; i < len; i++) {
    tx.bills[i].dispensed = bills[i].dispensed
    tx.bills[i].rejected = bills[i].rejected
  }
}

Brain.prototype._fiatError = function _fiatError (err) {
  console.log(err)
  const state = this.tx.started ? 'fiatTransactionError' : 'fiatError'
  this._timedState(state)
}

Brain.prototype._dispense = function _dispense () {
  this.updateTx({dispense: true})
  .then(() => this._physicalDispense())
  .catch(err => {
    if (err.statusCode === 570) return this._timedState('outOfCash')
    console.log(err.stack)
    return this._fiatError(err)
  })
}

Brain.prototype._physicalDispense = function _physicalDispense () {
  const fiatCode = this.tx.fiatCode
  const notes = [this.tx.bills[0].provisioned, this.tx.bills[1].provisioned]

  if (fiatCode !== this.billDispenser.fiatCode) {
    console.log('Wrong dispenser currency; dispenser: %s, tx: %s',
      this.billDispenser.fiatCode, fiatCode)
    return this._timedState('wrongDispenserCurrency')
  }

  this.billDispenser.dispense(notes, (err, result) => {
    // TODO: More detailed dispense error
    if (err) {
      console.log(err.stack)
      return this._fiatError(err)
    }

    const txId = this.tx.id
    const bills = result.bills

    fillInBills(this.tx, bills)
    const dispenseConfirmed = fullDispense(this.tx)

    this.fastUpdateTx({bills: this.tx.bills, error: result.error, dispenseConfirmed})

    if (!dispenseConfirmed) {
      return this._transitionState('outOfCash')
    }

    setTimeout(() => {
      const doComplete = this.state === 'fiatComplete' &&
        this.tx.id === txId

      if (doComplete) return this._completed()
    }, 60000)

    this._transitionState('fiatComplete', {tx: this.tx})
  })

  this._transitionState('dispensing')
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
      this.smsCompliance({returnState: 'redeemLater'})
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
  this.smsCompliance({redeem: true})
}

Brain.prototype._fiatReceipt = function _fiatReceipt () {
  const tx = this.tx
  this._timedState('fiatReceipt', {
    data: {tx: tx},
    timeout: 120000
  })
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

module.exports = Brain
