// @flow weak

const fs = require('fs')
const cp = require('child_process')
const os = require('os')
const path = require('path')
const net = require('net')
const _ = require('lodash/fp')
const R = require('ramda')
const async = require('async')
const pify = require('pify')
const minimist = require('minimist')

const sms = require('./flows/sms')
const coinUtil = require('./coin-util')

const commandLine = minimist(process.argv.slice(2))

const pairing = require('./pairing')
const Tx = require('./tx')

const BN = require('./bn')

const usbreset = require('./usbreset')
const version = require('../package.json').version

let transitionTime

const BILL_ACCEPTING_STATES = ['billInserted', 'billRead', 'acceptingBills',
  'acceptingFirstBill', 'maintenance']
const INITIAL_STATE = 'start'
const MIN_SCREEN_TIME = 1000
const POLL_INTERVAL = commandLine.pollTime || 5000

const Brain = function (config) {
  if (!(this instanceof Brain)) return new Brain(config)

  this.rootConfig = config
  this.config = config.brain

  this.bootTime = Date.now()

  this.dataPath = path.resolve(__dirname, '..', this.config.dataPath)
  this.certPath = path.resolve(this.dataPath, 'cert.json')
  this.connectionInfoPath = path.resolve(this.dataPath, 'connection_info.json')
  this.dbFile = path.resolve(this.dataPath, 'txDb.json')

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
  this.setBillValidator(require('./id003/id003').factory(config.id003))

  this.setBrowser(require('./browser')())
  this._setState(INITIAL_STATE)
  this.tx = null
  this.billsPending = false
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
  this.uiCartridges = null
  this.powerDown = false
  this.beforeIdleState = true
}

const EventEmitter = require('events').EventEmitter
const util = require('util')
util.inherits(Brain, EventEmitter)

Brain.prototype.determinePlatform = function determinePlatform () {
  if (fs.existsSync('/etc/inittab')) return 'N7G1'
  if (fs.existsSync('/etc/init/lamassu-machine.conf')) return 'AAEON'
  return 'UNKNOWN'
}

Brain.prototype.traderRun = function traderRun (cb) {
  this.trader.poll(cb)
  this.pollHandle = setInterval(() => {
    this.trader.poll()
  }, POLL_INTERVAL)
}

Brain.prototype.stop = function stop () {
  clearInterval(this.pollHandle)
}

Brain.prototype.run = function run () {
  console.log('crypto Machine software initialized.')
  const self = this
  this._init()
  this._setUpN7()
  this.browser().listen(this.config.wsPort)
  this._transitionState('booting')
  usbreset.reset(this.config.resetBasePath, this.determinePlatform())
  this.checkWifiStatus()
  this._periodicLog()

  const callback = function () {
    self._transitionState('restart')
    console.log('Scheduled restart after idle time.')
    process.exit()
  }

  this._executeCallbackAfterASufficientIdlePeriod(callback)
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

  const tasks = {}
  if (batteryCapacityPath) {
    tasks.battery = async.apply(fs.readFile, batteryCapacityPath, {encoding: 'utf8'})
  }

  if (tempSensorPath) {
    tasks.temperature = async.apply(fs.readFile, tempSensorPath, {encoding: 'utf8'})
  }

  function reporting () {
    const clauses = ['version: %s, cpuLoad: %s, memUse: %s, memFree: %s\n  nodeUptime: %s, ' +
    'osUptime: %s']
    async.parallel(tasks, function (err, results) {
      if (err) return console.log(err)
      if (results.battery) {
        clauses.push('battery: ' + results.battery.trim() + '%')
      }
      if (results.temperature) {
        clauses.push('CPU temperature: ' +
          (results.temperature.trim() / 1000) + '° C')
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

Brain.prototype._initializeCertificate = function _initializeCertificate () {
  this._transitionState('initializing')
  pairing.init(this.certPath)
  .then(clientCert => {
    this.clientCert = clientCert
    this.initTrader()
  })
}

Brain.prototype._connect = function _connect () {
  this.clientCert = pairing.getCert(this.certPath)

  if (this.clientCert) return this.initTrader()

  this._transitionState('virgin')
}

Brain.prototype.checkWifiStatus = function checkWifiStatus () {
  const self = this
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
  this.trader.on('pollUpdate', function () { self._pollUpdate() })
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
  const billValidator = this.getBillValidator()

  billValidator.on('error', function (err) { self._billValidatorErr(err) })
  billValidator.on('disconnected', function () { self._billValidatorErr() })
  billValidator.on('billAccepted', function () { self._billInserted() })
  billValidator.on('billRead', function (data) { self._billRead(data) })
  billValidator.on('billValid', function () { self._billValid() })
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

  if (!this.trader) {
    const rec = {
      action: this.state,
      wifiList,
      locale: 'en-US'
    }

    return this.browser().send(rec)
  }

  const cryptoCode = this.singleCrypto()
  ? this.trader.coins[0]
  : null

  const fullRec = {
    action: this.state,
    localeInfo: this.localeInfo,
    fiatCode: this.fiatCode,
    cryptoCode: cryptoCode,
    cartridges: this.uiCartridges,
    coins: this.trader.coins,
    twoWayMode: this.twoWayMode(),
    wifiList: wifiList
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
      this._initializeCertificate()
      break
    case 'pairingScan':
      this._pairingScan()
      break
    case 'pairingScanCancel':
      this.scanner.cancel()
      this.initTrader()
      break
    case 'testMode':
      this._testMode()
      break
    case 'start':
      this.selectedDirection = 'cashIn'
      this.startScreen()
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
      this._restart()
      break
    case 'idCodeFailedRetry':
      this._transitionState('idCode')
      break
    case 'cancelScan':
      this._cancelScan()
      break
    case 'badPhoneNumberOk':
      this._registerPhone()
      break
    case 'badSecurityCodeOk':
      this._phoneNumber(this.currentPhoneNumber)
      break
    case 'cancelPhoneNumber':
    case 'cancelSecurityCode':
    case 'maxPhoneRetriesOk':
      this._cancelPhone()
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
    case 'startFiat':
      this.selectedDirection = 'cashOut'
      this.startScreen()
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
      this._idle()
      break
    case 'depositTimeout':
      this._depositTimeout()
      break
    case 'cashOut':
      this._cashOut()
      break
    case 'phoneNumber':
      this._phoneNumber(req.data)
      break
    case 'securityCode':
      this._securityCode(req.data)
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

  this._connect()
}

Brain.prototype._unpaired = function _unpaired () {
  this._setState('unpaired')
  this.browser().send({action: 'unpaired'})
}

Brain.prototype._pairingScan = function _pairingScan () {
  const self = this
  this._setState('pairingScan')
  this.browser().send({action: 'pairingScan'})

  this.scanner.scanPairingCode(function (err, totem) {
    if (err) return self._pairingError(err)
    self._pair(totem)
  })
}

Brain.prototype.activate = function activate () {
  const connectionInfo = pairing.connectionInfo(this.connectionInfoPath)
  const config = this.rootConfig
  const protocol = config.http ? 'http:' : 'https:'

  if (config.mockTrader) {
    this.trader = require('./mocks/trader')(protocol, this.clientCert, connectionInfo)
  } else {
    this.trader = require('./trader')(protocol, this.clientCert, connectionInfo)
  }

  this.idVerify = require('./compliance/id_verify').factory({trader: this.trader})

  this._initTraderEvents()
  this.traderRun(() => this.initValidator())
}

Brain.prototype._pair = function _pair (totem) {
  const self = this
  this._transitionState('pairing')

  return pairing.pair(totem, this.clientCert, this.connectionInfoPath)
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
  this.getBillValidator().run(function () {
    self.trader.run()
    self._idle()
  })
}

Brain.prototype._testModeOff = function _testModeOff () {
  const self = this
  this.getBillValidator().close(function () {
    self.testModeOn = false
    self.trader.removeAllListeners()
    self.trader = self.traderOld
    self._initTraderEvents()
    self._transitionState('virgin')
  })
}

function buildUiCartridges (cartridges, virtualCartridges) {
  const result = _.cloneDeep(cartridges)

  // TODO: Generalize, if we ever need more than 1 virtual cartridge
  result.push({denomination: virtualCartridges[0], count: null})
  const sortedDenominations =
    _.sortBy(el => parseInt(el.denomination, 10), result)

  return sortedDenominations
}

Brain.prototype._isPendingScreen = function _isPendingScreen () {
  return R.contains(this.state, ['goodbye'])
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
  this.getBillValidator().run(function (err) {
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

  this.getBillValidator().lightOff()
  this.idVerify.reset()
  this.currentPhoneNumber = null
  this.currentSecurityCode = null
  this.secured = false
  this.rejected = false
  this.redeem = false
  this.numCoins = this.trader.coins.length
  this.selectedDirection = null
  this.tx = Tx.newTx()
  this.bill = null

  this._setState('pendingIdle')

  if (this.networkDown) return this._networkDown()

  const localeInfo = _.cloneDeep(this.localeInfo)
  locale = locale || localeInfo.primaryLocale
  localeInfo.primaryLocale = locale

  this.localeInfo = localeInfo

  this.beforeIdleState = false
  this.trader.clearConfigVersion()

  this.tx = Tx.update(this.tx, {fiatCode: this.fiatCode})

  // We've got our first contact with server
  if (this.trader.twoWayMode) {
    this._idleTwoWay(self.localeInfo)
  } else {
    this._idleOneWay(self.localeInfo)
  }
}

Brain.prototype._chooseCoin = function _chooseCoin (cryptoCode) {
  this.tx = Tx.update(this.tx, {cryptoCode})
  this.browser().send({cryptoCode})
  this.sendRates()
  this.preStartScreen()
}

Brain.prototype.wasSingleCrypto = function wasSingleCrypto () {
  return this.numCoins === 1
}

Brain.prototype.singleCrypto = function singleCrypto () {
  return this.trader.coins.length === 1
}

Brain.prototype.twoWayMode = function twoWayMode () {
  return this.trader.twoWayMode
}

Brain.prototype.smsCompliance = function smsCompliance (nextScreen) {
  const self = this
  const flow = new sms.Flow({nextScreen})
  this.flow = flow

  flow.on('screen', function (rec) {
    self._transitionState(rec.screen, {context: 'compliance'})
  })

  flow.on('idle', function () { self.flow = null; self._idle() })

  flow.on('sendCode', function (phone) {
    self.trader.phoneCode(phone, function (err, result) {
      if (err && err.name === 'BadNumberError') {
        return flow.handle('badPhoneNumber')
      }

      if (err) {
        console.log(err.stack)
        return flow.handle('networkError')
      }

      flow.handle('requiredSecurityCode', result.code)
    })
  })

  flow.on('success', function () {
    self.flow = null
    self.startScreen(true)
  })

  flow.handle('start')
}

Brain.prototype.preStartScreen = function preStartScreen () {
  if (this.singleCrypto() && this.trader.twoWayMode) {
    return this._transitionState('dualIdle')
  }

  if (this.singleCrypto()) {
    return this._transitionState('idle')
  }

  return this.startScreen()
}

Brain.prototype.startScreen = function startScreen (compliant) {
  if (this.trader.smsVerificationEnabled && !compliant) {
    return this.smsCompliance()
  }

  if (this.singleCrypto()) {
    if (this.selectedDirection === 'cashOut') return this._chooseFiat()
    if (this.selectedDirection === 'cashIn') return this._start()
    console.error('Start direction not set!')
    this._idle()
  }

  if (this.trader.twoWayMode) {
    return this._timedState('dualIdle')
  }

  this._start()
}

Brain.prototype._idleTwoWay = function _idleTwoWay (localeInfo) {
  const self = this
  const cartridges = this.trader.cartridges
  const virtualCartridges = this.trader.virtualCartridges
  const uiCartridges = buildUiCartridges(cartridges, virtualCartridges)
  this.uiCartridges = uiCartridges

  if (!this.billDispenser) {
    this.billDispenser = this.rootConfig.mockBillDispenser
    ? require('./mocks/billdispenser').factory(this.rootConfig.billDispenser)
    : require('./billdispenser').factory(this.rootConfig.billDispenser)
  }

  if (!this.billDispenser.initialized) this._transitionState('booting')
  if (this.billDispenser.initializing) return

  this.billDispenser.init({
    cartridges,
    fiatCode: this.trader.locale.fiatCode
  }, function () {
    self._chooseCoinScreen(localeInfo, uiCartridges)
  })
}

Brain.prototype._idleOneWay = function _idleOneWay (localeInfo) {
  this._chooseCoinScreen(localeInfo)
}

Brain.prototype._chooseCoinScreen = function _chooseCoinsScreen (localeInfo, cartridges) {
  if (this.singleCrypto()) {
    this.browser().send({
      localeInfo: localeInfo,
      cartridges: cartridges,
      coins: this.trader.coins,
      twoWayMode: this.twoWayMode()
    })
    return this._chooseCoin(this.trader.coins[0])
  }

  this._transitionState('chooseCoin', {
    localeInfo: localeInfo,
    cartridges: cartridges,
    coins: this.trader.coins,
    twoWayMode: this.twoWayMode()
  })
}

Brain.prototype.isIdleState = function isIdleState () {
  return this.wasSingleCrypto()
  ? R.contains(this.state, ['idle', 'dualIdle'])
  : this.state === 'chooseCoin'
}

Brain.prototype._setLocale = function _setLocale (data) {
  const self = this
  this._idle(data.locale)
  this._screenTimeout(function () { self._idle() }, 30000)
}

Brain.prototype._balanceLow = function _balanceLow () {
  const self = this

  function timeoutHandler () {
    self._idle()
  }

  function timeout () {
    self._screenTimeout(timeoutHandler, 10000)
  }

  this._transitionState('balanceLow')
  timeout()
}

Brain.prototype._start = function _start () {
  if (this.startDisabled) return

  const fiatBalance = this.balance()
  const highestBill = this.getBillValidator().highestBill(fiatBalance)

  if (!highestBill) return this._balanceLow()

  this.tx = Tx.update(this.tx, {direction: 'cashIn'})
  this._startAddressScan()
}

Brain.prototype._startIdScan = function _startIdScan () {
  const self = this
  const txId = this.tx.id
  this._transitionState('scanId', {beep: true})
  this.idVerify.reset()
  this.getBillValidator().lightOn()

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
  if (!offInterval) return this.getBillValidator().lightOn()

  this.getBillValidator().lightOn()
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
  this.getBillValidator().lightOff()
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
  this.idVerify.verifyUser(function (err, result) {
    if (!err && result.success) return self._firstBill()

    // The rest of these screens require user input and need a timeout
    let nextState
    if (err) {
      nextState = 'idVerificationError'
    } else if (result.errorCode === 'codeMismatch') {
      nextState = 'idCodeFailed'
    } else {
      nextState = 'idVerificationFailed'
    }

    self._transitionState(nextState)
    self._screenTimeout(self._restart.bind(self), self.config.confirmTimeout)
  })
}

Brain.prototype._idCode = function _idCode (code) {
  if (code === null) return this._restart()    // Timeout
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
  this.getBillValidator().disable()
}

Brain.prototype.isStaticState = function isStaticState () {
  const staticStates = ['chooseCoin', 'idle', 'pendingIdle', 'dualIdle',
    'networkDown', 'unpaired', 'maintenance', 'virgin', 'wifiList']

  return R.contains(this.state, staticStates)
}

Brain.prototype._needsIdleRefresh = function _needsIdleRefresh () {
  const trader = this.trader

  if (this.singleCrypto()) {
    if (this.state === 'idle' && trader.twoWayMode) return true
    if (this.state === 'dualIdle' && !trader.twoWayMode) return true
    return false
  }
}

Brain.prototype.balance = function balance () {
  const cryptoCode = this.tx.cryptoCode
  if (!cryptoCode) throw new Error('No cryptoCode, this shouldn\'t happen')

  console.log('DEBUG99: %j', [cryptoCode, this.trader.balances])
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

Brain.prototype._pollUpdate = function _pollUpdate () {
  const locale = this.trader.locale
  this.fiatCode = locale.fiatCode
  this.localeInfo = locale.localeInfo

  if (!this.isIdleState()) return

  const coinsChanged = this.numCoins !== this.trader.coins.length

  const refresh = this._needsIdleRefresh() || coinsChanged

  if (refresh) this._idle()
}

Brain.prototype._networkDown = function _networkDown () {
  this.networkDown = true
  if (_.includes(this.state, BILL_ACCEPTING_STATES)) {
    this.getBillValidator().disable()
    this.browser().send({sendOnly: true, reason: 'networkDown'})
    return
  }
  if (!this.isStaticState()) return
  this._forceNetworkDown()
}

Brain.prototype._forceNetworkDown = function _forceNetworkDown () {
  const self = this

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

Brain.prototype._networkUp = function _networkUp () {
  // Don't go to start screen yet
  if (!this.getBillValidator().hasDenominations()) return

  this.networkDown = false
  if (_.includes(this.state, ['networkDown', 'connecting', 'wifiConnected', 'pairing'])) {
    this._restart()
  }
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

Brain.prototype._restart = function _restart () {
  if (this.billsPending) console.trace('billsPending restart')
  console.assert(!this.billsPending, "Shouldn't restart, bills are bill!")
  this.getBillValidator().disable()
  this._idle()
}

Brain.prototype._assertState = function _assertState (expected) {
  const actual = this.state
  console.assert(actual === expected,
    'State should be ' + expected + ', is ' + actual)
}

Brain.prototype._handleScan = function _handleScan (address) {
  this.tx = Tx.update(this.tx, {toAddress: address})

  const checkId = this.trader.idVerificationEnabled
  if (checkId) return this._startIdScan()
  this._firstBill()
}

Brain.prototype._firstBill = function _firstBill () {
  this.browser().send({action: 'scanned', buyerAddress: this.tx.toAddress})
  this._setState('acceptingFirstBill')
  this.getBillValidator().enable()
  this._screenTimeout(this._restart.bind(this), this.config.billTimeout)
}

// Bill validating states

Brain.prototype._billInserted = function _billInserted () {
  this.browser().send({action: 'acceptingBill'})
  this._setState('billInserted')
}

Brain.prototype._billRead = function _billRead (data) {
  const billValidator = this.getBillValidator()

  if (!_.includes(this.state, BILL_ACCEPTING_STATES)) {
    console.trace('Attempting to reject, not in bill accepting state.')
    return billValidator.reject()
  }

  this.insertBill(data.denomination)

  console.log('DEBUG44: %j', this.tx)

  const totalFiat = this.tx.fiat.add(this.bill.fiat)

  // Trader balance is balance as of start of user session.
  // Reduce it by fiat we owe user.
  const fiatBalance = this.balance().sub(totalFiat)

  const txLimit = this.trader.txLimit

  if (txLimit && totalFiat.gt(txLimit) || fiatBalance.lt(0)) {
    console.log('DEBUG: Out of cash, attempting reject')
    billValidator.reject()

    // Bills are just regular integers
    const highestBillTxLimit = txLimit
    ? billValidator.highestBill(txLimit.sub(this.tx.fiat))
    : Infinity

    const newFiatBalance = this.balance().sub(this.tx.fiat)

    const highestBillBalance = billValidator.highestBill(newFiatBalance)
    const lowestHighestBill = Math.min(highestBillTxLimit, highestBillBalance)

    const reason = lowestHighestBill === highestBillTxLimit
    ? 'transactionLimit'
    : 'lowBalance'

    if (!lowestHighestBill) {
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
      highestBill: lowestHighestBill,
      reason: reason
    })

    return
  }

  billValidator.stack()
  this.browser().send({
    action: 'acceptingBill',
    readingBill: this.bill.fiat.toNumber()
  })
  this._setState('billRead')
}

Brain.prototype.saveTx = function saveTx (tx) {
  return pify(fs.appendFile)(this.dbFile, JSON.stringify(tx) + '\n')
}

Brain.prototype.updateTx = function updateTx (updateTx) {
  const oldTx = this.tx
  this.tx = Tx.update(oldTx, updateTx)

  if (Tx.eq(oldTx, this.tx)) return Promise.resolve(oldTx)

  console.log('DEBUG26: %j', [this.tx, updateTx])

  return this.saveTx(this.tx)
  .then(() => this.trader.postTx(this.tx))
  .then(tx => {
    this.tx = tx
    return tx
  })
}

// Don't wait for server response
Brain.prototype.fastUpdateTx = function fastUpdateTx (updateTx) {
  const oldTx = this.tx
  this.tx = Tx.update(oldTx, updateTx)

  if (Tx.eq(oldTx, this.tx)) return Promise.resolve(oldTx)

  this.trader.postTx(this.tx)
  .catch(console.log)

  return this.saveTx(this.tx)
  .then(this.tx)
}

Brain.prototype._billValid = function _billValid () {
  const trader = this.trader

  this._transitionState('acceptingBills')
  const bill = this.bill

  // No going back
  this.billsPending = true
  this.bill = null

  const updatedTx = Tx.addBill(bill, this.tx)
  const totalFiat = updatedTx.fiat

  const fiatBalance = this.balance().sub(totalFiat)

  const txLimit = trader.txLimit
  const billValidator = this.getBillValidator()
  let sendOnly = false

  if (totalFiat.add(billValidator.lowestBill()).gt(txLimit)) {
    sendOnly = 'transactionLimit'
  }

  // Note: Exact precision isn't important here
  const highestBill = billValidator.highestBill(fiatBalance.toNumber())

  if (!highestBill) sendOnly = true

  if (sendOnly) {
    billValidator.disable()
  }

  return this.fastUpdateTx(updatedTx)
  .then(() => this._screenTimeout(() => this._sendCoins(), this.config.billTimeout))
  .then(() => this.browser().send({
    credit: this._uiCredit(),
    sendOnly: sendOnly,
    cryptoCode: updatedTx.cryptoCode
  }))
}

// TODO: clean this up
Brain.prototype._billRejected = function _billRejected () {
  const self = this
  if (!R.contains(this.state, BILL_ACCEPTING_STATES)) return

  const returnState = this.tx.fiat.eq(0)
  ? 'acceptingFirstBill'
  : 'acceptingBills'

  this._transitionState(returnState)

  this._screenTimeout(function () {
    returnState === 'acceptingFirstBill'
    ? self._restart()
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
    this.getBillValidator().enable()
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
  const tx = Tx.addBill(this.bill, this.tx)

  console.log('DEBUG77: %j', [this.tx, tx])

  return {
    cryptoCode: tx.cryptoCode,
    fiat: tx.fiat.toNumber(),
    cryptoAtoms: tx.cryptoAtoms.toNumber(),
    lastBill: _.last(tx.bills.map(bill => bill.fiat.toNumber()))
  }
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
  return this._executesendCoins()
}

Brain.prototype._executesendCoins = function _executesendCoins () {
  this.getBillValidator().disable()

  this._verifyTransaction()

  return this.updateTx({send: true})
  .then(tx => this._cashInComplete(tx))
  .catch(err => this._sendCoinsError(err))
}

// Giving up, go to special screens asking user to contact operator
Brain.prototype._sendCoinsError = function _sendCoinsError (err) {
  console.log('Error sending cryptos: %s', err.message)

  const withdrawFailureRec = {
    credit: this._uiCredit(),
    txId: this.tx.id
  }

  // Giving up
  this.billsPending = false

  const self = this
  if (err.status === 'InsufficientFunds') {
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

  this.billsPending = false
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

  this._screenTimeout(this._restart.bind(this), this.config.goodbyeTimeout)
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
  this.billsPending = false
  this._restart()
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
        return
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

  if (this.billsPending) {
    this.billValidatorErrorFlag = true
    this.getBillValidator().disable() // Just in case. If error, will get throttled.
    this.browser().send({credit: this._uiCredit(), sendOnly: true, reason: 'validatorError'})
    return
  }

  if (this.powerDown) return
  self._transitionState('maintenance')
  setTimeout(function () { self.emit('error', err) }, 15000)
}

Brain.prototype._getFiatButtonResponse = function _getFiatButtonResponse () {
  const tx = this.tx
  const cartridges = this.trader.cartridges
  const virtualCartridges = this.trader.virtualCartridges
  const txLimit = this.trader.fiatTxLimit

  const activeDenominations = Tx.computeCashOut(tx, cartridges, virtualCartridges, txLimit)

  return {tx, activeDenominations}
}

Brain.prototype._outOfCash = function _outOfCash () {
  const self = this

  function timeoutHandler () {
    self._idle()
  }

  function timeout () {
    self._screenTimeout(timeoutHandler, 10000)
  }

  this._transitionState('outOfCash')
  timeout()
}

Brain.prototype._chooseFiat = function _chooseFiat () {
  const txId = this.tx.id
  console.log('DEBUG99: %j', this.tx)
  this.tx = Tx.update(this.tx, {fiatCode: this.fiatCode, direction: 'cashOut'})

  const response = this._getFiatButtonResponse()
  if (response.activeDenominations.isEmpty) return this._outOfCash()

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

Brain.prototype._registerPhone = function _registerPhone () {
  this._transitionState('registerPhone', {context: this.redeem ? 'redeem' : 'deposit'})
}

Brain.prototype._registerCode = function _registerCode () {
  this._transitionState('registerCode')
}

Brain.prototype._sendSecurityCode = function _sendSecurityCode (number) {
  const self = this

  this.trader.phoneCode(number, function (err, result) {
    if (err && err.name === 'BadNumberError') {
      return self._timedState('badPhoneNumber')
    }

    if (err) {
      console.log(err.stack)
      return self._fiatError(err)
    }

    self.currentPhoneNumber = number
    self.currentSecurityCode = result.code
  })
}

Brain.prototype._processPhoneNumber = function _processPhoneNumber (number) {
  const self = this

  if (!this.redeem) return this._sendSecurityCode(number)

  this.trader.fetchPhoneTx(number, function (err, res) {
    if (err && err.name === 'UnknownPhoneNumberError') {
      return self._timedState('unknownPhoneNumber')
    } else if (err) {
      return self._fiatError(err)
    }

    self.tx = res.tx
    self._sendSecurityCode(number)
  })
}

Brain.prototype._phoneNumber = function _phoneNumber (number) {
  const self = this

  if (!number) return this._idle()

  process.nextTick(function () { self._processPhoneNumber(number) })
  this._registerCode()
}

Brain.prototype._securityCode = function _securityCode (code) {
  if (!code) return this._idle()

  if (code !== this.currentSecurityCode) {
    return this._timedState('badSecurityCode')
  }

  if (this.redeem && !this.tx) {
    return this._timedState('unconfirmedDeposit')
  }

  this.secured = true

  this._transitionState('waiting')

  this.updateTx({phone: this.currentPhoneNumber})
  .then(tx => {
    if (this.redeem) return this._dispense()
    this._cashOut()
  })
}

Brain.prototype._cancelPhone = function _cancelPhone () {
  if (this.redeem) return this._idle()
  if (this.rejected) return this._timedState('preReceipt')
  this._idle()
}

Brain.prototype.exceedsZeroConf = function exceedsZeroConf (tx) {
  const coin = Tx.coins[tx.cryptoCode]

  if (!coin) throw new Error('Fatal: unsupported coin: ' + tx.cryptoCode)

  return coin.zeroConf && tx.fiat.gt(this.trader.zeroConfLimit)
}

Brain.prototype._cashOut = function _cashOut () {
  const tx = this.tx

  console.log('DEBUG23: %j', tx)
  if (this.exceedsZeroConf(tx) && !this.secured) {
    return this._registerPhone()
  }

  if (this.rejected && this.secured) {
    return this._redeemLater()
  }

  this._transitionState('deposit', {tx})

  return this.updateTx({send: true})
  .then(tx => {
    console.log('DEBUG24: %j', tx)
    const amountStr = this.toCryptoUnits(tx.cryptoAtoms, tx.cryptoCode).toString()
    const depositUrl = coinUtil.depositUrl(tx.toAddress, tx.cryptoCode, amountStr)
    this._waitForDispense('notSeen')
    return this.browser().send({depositInfo: tx, depositUrl})
  })
  .catch(err => this._fiatError(err))
}

Brain.prototype.toCryptoUnits = function toCryptoUnits (cryptoAtoms, cryptoCode) {
  const unitScale = Tx.coins[cryptoCode].unitScale
  return cryptoAtoms.shift(-unitScale)
}

// User has deposited cryptos but we haven't received them after waiting
Brain.prototype._depositTimeout = function _depositTimeout () {
  this.rejected = true
  this.tx.started = true

  if (this.secured) {
    return this._redeemLater()
  }

  this._registerPhone()
}

Brain.prototype._redeemLater = function _redeemLater () {
  return this.updateTx({redeem: true})
  .then(() => this._timedState('redeemLater'))
  .catch(e => this._fiatError(e))
}

Brain.prototype._waitForDispense = function _waitForDispense (status) {
  const self = this
  this.trader.waitForDispense(this.tx, status)
  .then(tx => {
    if (self.tx.id !== tx.id) return
    return self._dispenseUpdate(tx)
  })
  .catch(() => return self._timedState('depositTimeout'))
}

function fullDispense (bills, fiat, cartridges) {
  const len = bills.length
  let total = BN(0)

  for (let i = 0; i < len; i++) {
    total = total.add(cartridges[i].denomination.mul(bills[i].accepted))
  }

  return total.eq(fiat)
}

function fillInBills (tx, bills) {
  const len = bills.length
  for (let i = 0; i < len; i++) {
    tx.bills[i].actualDispense = bills[i].accepted
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
    console.log(err.stack)
    return this._fiatError(err)
  })
}

Brain.prototype._physicalDispense = function _physicalDispense () {
  const self = this
  const tx = this.tx
  const fiatCode = tx.fiatCode
  const notes = [tx.bills[0].count, tx.bills[1].count]

  if (fiatCode !== this.billDispenser.fiatCode) {
    console.log('Wrong dispenser currency; dispenser: %s, tx: %s',
      this.billDispenser.fiatCode, fiatCode)
    return this._timedState('wrongDispenserCurrency')
  }

  this.billDispenser.dispense(notes, function (err, result) {
    // TODO: More detailed dispense error
    if (err) {
      console.log(err.stack)
      return self._fiatError(err)
    }

    const txId = self.tx.id
    const bills = result.bills

    const tx = self.tx
    let cartridges = self.trader.cartridges
    const wasFullDispense = fullDispense(bills, tx.fiat, cartridges)
    fillInBills(tx, bills)
    tx.error = result.err
    self.trader.dispenseAck(tx)
    if (!wasFullDispense) {
      return self._transitionState('outOfCash')
    }

    setTimeout(function () {
      const doComplete = self.state === 'fiatComplete' &&
        self.tx.id === txId
      if (doComplete) {
        self._completed()
      }
    }, 60000)
    self._transitionState('fiatComplete', {tx: tx})
  })
  this._transitionState('dispensing')
}

Brain.prototype._dispenseUpdate = function _dispenseUpdate (tx) {
  if (this.state !== 'deposit' && this.state !== 'pendingDeposit') return

  const overZeroConf = this.exceedsZeroConf(tx)
  const status = tx.status
  const needToRedeem = !R.contains(status, ['instant', 'confirmed']) && overZeroConf

  if (needToRedeem && this.secured) return this._redeemLater()

  if (needToRedeem) {
    console.log('WARNING: This shouldn\'t happen; over zero-conf limit and not secured')
    return this._registerPhone()
  }

  switch (status) {
    case 'rejected':
      this.rejected = true
      this._registerPhone()
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
  this._registerPhone()
}

Brain.prototype._fiatReceipt = function _fiatReceipt () {
  const tx = this.tx
  this._timedState('fiatReceipt', {
    data: {tx: tx},
    timeout: 120000
  })
}

Brain.prototype.getBillValidator = function getBillValidator () {
  return this.billValidator
}

Brain.prototype.setBillValidator = function setBillValidator (obj) {
  this.billValidator = obj
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
