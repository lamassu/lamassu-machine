// @flow weak

var fs = require('fs')
var cp = require('child_process')
var os = require('os')
var path = require('path')
var net = require('net')
var _ = require('lodash')
var R = require('ramda')
var J = require('json-patch')
var uuid = require('node-uuid')
var async = require('async')
var sms = require('./flows/sms')

var coins = {
  BTC: {
    displayScale: 5,
    unitScale: 8,
    zeroConf: true
  },
  ETH: {
    displayScale: 15,
    unitScale: 18,
    zeroConf: false
  }
}

var BigNumber = require('bignumber.js')
BigNumber.config({ROUNDING_MODE: BigNumber.ROUND_HALF_EVEN})

var BillMath = require('./bill_math')
var usbreset = require('./usbreset')
var version = require('../package.json').version

var transitionTime = null

var DECIMAL_PLACES = 3
var HOURS = 60 * 60 * 1000
var CASH_RESERVE_EXPIRATION = 24 * HOURS
var CASH_RESERVE_CHECK = 1 * HOURS
var BILL_ACCEPTING_STATES = ['billInserted', 'billRead', 'acceptingBills',
  'acceptingFirstBill', 'maintenance']
var INITIAL_STATE = 'start'
var MIN_SCREEN_TIME = 1000

var Brain = function (config) {
  if (!(this instanceof Brain)) return new Brain(config)

  this.rootConfig = config
  this.config = config.brain

  this.dataPath = path.resolve(__dirname, '..', this.config.dataPath)

  var certs = {
    certFile: path.resolve(this.dataPath, this.config.certs.certFile),
    keyFile: path.resolve(this.dataPath, this.config.certs.keyFile)
  }
  if (config.noCert) certs.certFile = null

  this.currency = 'USD'
  this.bootTime = Date.now()

  var wifiConfig = config.wifi
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

  var connectionInfoPath = path.resolve(this.dataPath,
    this.config.connectionInfoPath)

  var pairingConfig = {
    certs: certs,
    connectionInfoPath: connectionInfoPath
  }
  this.pairing = require('./pairing')(pairingConfig)

  config.id003.currency = this.currency
  this.setBillValidator(require('./id003/id003').factory(config.id003))

  var traderConfig = config.trader
  traderConfig.currency = this.currency
  traderConfig.lowestBill = this.getBillValidator().lowestBill()
  traderConfig.certs = certs
  if (config.http) traderConfig.protocol = 'http'

  if (config.mockTrader) {
    this.trader = require('./mocks/trader')(traderConfig)
  } else {
    this.trader = require('./trader')(traderConfig)
  }

  this.idVerify = require('./compliance/id_verify').factory({trader: this.trader})

  this.setBrowser(require('./browser')())
  this._setState(INITIAL_STATE)
  this.cryptoAddress = null
  this.credit = {fiat: 0, cryptoAtoms: new BigNumber(0), lastBill: null}
  this.tx = null
  this.pending = null
  this.billsPending = false
  this.currentScreenTimeout = null
  this.locked = true
  this.wifis = null
  this.screenTimeout = null
  this.lastTransation = null
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
}

var EventEmitter = require('events').EventEmitter
var util = require('util')
util.inherits(Brain, EventEmitter)

Brain.prototype.determinePlatform = function determinePlatform () {
  if (fs.existsSync('/etc/inittab')) return 'N7G1'
  if (fs.existsSync('/etc/init/lamassu-machine.conf')) return 'AAEON'
  return 'UNKNOWN'
}

Brain.prototype.run = function run () {
  console.log('crypto Machine software initialized.')
  var self = this
  this._init()
  this._setUpN7()
  this.browser().listen()
  this._transitionState('booting')
  usbreset.reset(this.config.resetBasePath, this.determinePlatform())
  this.checkWifiStatus()
  this._periodicLog()

  // Temporary, for Raqia back compat
  this._ensureRaqiaRegistration(function () {})

  var callback = function () {
    self._transitionState('restart')
    console.log('Scheduled restart after idle time.')
    process.exit()
  }

  this._executeCallbackAfterASufficientIdlePeriod(callback)
}

Brain.prototype._executeCallbackAfterASufficientIdlePeriod =
function _executeCallbackAfterASufficientIdlePeriod (callback) {
  var self = this
  var config = this.config
  var exitTime = config.exitTime
  var exitOnIdle = exitTime + config.idleTime

  setInterval(function () {
    if (self.isStaticState()) {
      var date = new Date()
      var elapsed = (date.getTime()) - self.bootTime
      if (exitOnIdle && elapsed > exitOnIdle) {
        callback()
      }
    }
  }, this.config.checkIdle)
}

Brain.prototype._periodicLog = function _periodicLog () {
  var self = this
  var batteryCapacityPath = this.config.batteryCapacityPath
  var tempSensorPath = this.config.tempSensorPath

  var tasks = {}
  if (batteryCapacityPath) {
    tasks.battery = async.apply(fs.readFile, batteryCapacityPath, {encoding: 'utf8'})
  }

  if (tempSensorPath) {
    tasks.temperature = async.apply(fs.readFile, tempSensorPath, {encoding: 'utf8'})
  }

  function reporting () {
    var clauses = ['version: %s, cpuLoad: %s, memUse: %s, memFree: %s\n  nodeUptime: %s, ' +
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
      var cpuLoad = os.loadavg()[1].toFixed(2)
      var memUse = (process.memoryUsage().rss / Math.pow(1000, 2)).toFixed(1) +
      ' MB'
      var memFree = (os.freemem() * 100 / os.totalmem()).toFixed(1) + '%'
      var nodeUptimeMs = Date.now() - self.bootTime
      var nodeUptime = (nodeUptimeMs / 3600000).toFixed(2) + 'h'
      var osUptime = (os.uptime() / 3600).toFixed(2) + 'h'
      var format = clauses.join(', ')
      console.log(format, version, cpuLoad, memUse, memFree, nodeUptime, osUptime)
    })
  }
  reporting()
  setInterval(reporting, this.config.periodicLogInterval)
}

Brain.prototype._connect = function _connect () {
  var self = this
  if (!this.pairing.hasCert()) this._transitionState('initializing')
  this.pairing.init(function (err) {
    if (err) self.emit('error', err)
    self._startTrading()
  })
}

Brain.prototype._startTrading = function _startTrading () {
  var self = this

  this.getBillValidator().run(function (err) {
    if (err) return self._billValidatorErr(err)

    console.log('Bill validator connected.')
    self.trader.init(self.pairing.connectionInfo())

    self.trader.run()
    self.handlePendingTx(function () { self._idle() })
  })
}

Brain.prototype.checkWifiStatus = function checkWifiStatus () {
  var self = this
  this.wifi.status(function (err, status, ip) {
    if (err || status === 'pending') {
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
  this._initTraderEvents()
  this._initBrowserEvents()
  this._initBillValidatorEvents()
  this._initBrainEvents()
  this._loadDb()
  this._expireReservedBills()
}

Brain.prototype._initHearbeat = function _initHeartbeat () {
  var pingIntervalPtr
  var heartbeatServer = net.createServer(function (c) {
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
  var self = this

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
  var self = this
  this.trader.on('pollUpdate', function () { self._pollUpdate() })
  this.trader.on('networkDown', function () { self._networkDown() })
  this.trader.on('networkUp', function () { self._networkUp() })
  this.trader.on('error', function (err) { console.log(err.stack) })
  this.trader.on('unpair', function () { self._unpair() })
  this.trader.on('reboot', function () { self._restartService('Remote reboot') })
}

Brain.prototype._initBrowserEvents = function _initBrowserEvents () {
  var self = this
  var browser = this.browser()

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
  var self = this
  var billValidator = this.getBillValidator()

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
  var rootPath = '/sys/bus/usb/devices/2-1'

  if (!fs.existsSync(rootPath)) return

  var subdirs = fs.readdirSync(rootPath)
  subdirs.forEach(function (dir) {
    if (dir.indexOf('2-1') === 0) {
      var autosuspendPath = rootPath + '/' + dir + '/power/autosuspend'
      try {
        fs.writeFileSync(autosuspendPath, '-1')
      } catch (ex) {
        // File doesn't exist, that's ok.
      }
    }
  })
}

Brain.prototype._setUpN7 = function _setUpN7 () {
  var backlightPath = '/sys/class/backlight/pwm-backlight/brightness'
  if (fs.existsSync(backlightPath)) fs.writeFileSync(backlightPath, '160\n')
  this._setupWebcam()
  this._setupCheckPower()
}

Brain.prototype._connectedBrowser = function _connectedBrowser () {
  //  TODO: have to work on this: console.assert(this.state === State.IDLE)
  console.log('connected to browser')

  var cryptoCode = this.singleCrypto()
  ? this.trader.coins[0]
  : null

  var rec = {
    action: this.state,
    localeInfo: this.localeInfo,
    currency: this.currency,
    cryptoCode: cryptoCode,
    cartridges: this.uiCartridges,
    coins: this.trader.coins,
    twoWayMode: this.twoWayMode(),
    wifiList: []
  }

  if (this.state === 'wifiList' && this.wifis) rec.wifiList = this.wifis
  this.browser().send(rec)
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
      this._connect()
      break
    case 'pairingScan':
      this._pairingScan()
      break
    case 'pairingScanCancel':
      this.scanner.cancel()
      this._idle()
      break
    case 'testMode':
      this._testMode()
      break
    case 'start':
      this._start()
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
      this._chooseFiat()
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
  this.state = state
  this.emit(state)
  this.emit('newState', state)
  this.trader.stateChange(state, this.isIdleState())
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
  var rawSsid = data.rawSsid
  var ssid = data.ssid
  var self = this
  this.wifi.connect(rawSsid, ssid, data.pass, function (err, ip) {
    if (err) {
      // TODO: error screen
      console.log(err.stack)
      var ssidData = {
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

  if (!this.pairing.hasCert()) return this._transitionState('virgin')
  this._connect()
}

Brain.prototype._unpaired = function _unpaired () {
  this._setState('unpaired')
  this.browser().send({action: 'unpaired'})
}

Brain.prototype._pairingScan = function _pairingScan () {
  var self = this
  this._setState('pairingScan')
  this.browser().send({action: 'pairingScan'})

  this.scanner.scanPairingCode(function (err, json) {
    if (err) return self._pairingError(err)
    if (json === null) return self._restart()
    self._pair(json)
  })
}

Brain.prototype._pair = function _pair (json) {
  var self = this
  this._transitionState('pairing')
  this.pairing.pair(json, function (err, connectionInfo) {
    if (err) return self._pairingError(err)
    self.trader.pair(connectionInfo)
    self._idle()
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
  var self = this
  this.testModeOn = true
  this.traderOld = this.trader
  this.trader.removeAllListeners()
  this.trader = require('./mocks/trader')()
  this._initTraderEvents()
  this.pairing._connectionInfo = {}
  this.networkDown = false
  this.getBillValidator().run(function () {
    self.trader.run()
    self._idle()
  })
}

Brain.prototype._testModeOff = function _testModeOff () {
  var self = this
  this.getBillValidator().close(function () {
    self.testModeOn = false
    self.pairing._connectionInfo = null
    self.trader.removeAllListeners()
    self.trader = self.traderOld
    self._initTraderEvents()
    self._transitionState('virgin')
  })
}

function buildUiCartridges (cartridges, virtualCartridges) {
  var result = _.cloneDeep(cartridges)

  // TODO: Generalize, if we ever need more than 1 virtual cartridge
  result.push({denomination: virtualCartridges[0], count: null})
  var sortedDenominations =
  _.sortBy(result, function (el) { return parseInt(el.denomination, 10) })
  return sortedDenominations
}

Brain.prototype._dbPath = function _dbPath () {
  return path.resolve(this.dataPath, 'db.json')
}

Brain.prototype._loadDb = function _loadDb () {
  var dispenseTemplate = {
    reserved: {
      sessions: {}
    },
    cartridges: null,
    cartridgesUpdateId: null
  }

  var self = this
  function maintenance () {
    self._transitionState('maintenance')
  }

  try {
    var str = fs.readFileSync(this._dbPath()).toString()
    var parse = R.compose(R.pluck('patch'), R.map(JSON.parse),
      R.reject(R.isEmpty), R.split('\n'))
    var patch = parse(str)
    var db = {}
    if (patch.length > 0) J.apply(db, patch)
    this.db = db

    if (!db.dispense) {
      this._saveDb({op: 'add', path: '/dispense', value: dispenseTemplate})
    }

    if (!db.txs) this._saveDb({op: 'add', path: '/txs', value: []})
    if (!db.billInserts) this._saveDb({op: 'add', path: '/billInserts', value: []})
  } catch (err) {
    // TODO: use powwow logic to index, checksum and ignore partial last lines
    if (err.errno === 34) { // File not found
      this.db = {}
      this._saveDb({op: 'add', path: '/dispense', value: dispenseTemplate})
      this._saveDb({op: 'add', path: '/txs', value: []})
      this._saveDb({op: 'add', path: '/billInserts', value: []})
      return
    }

    console.log(err)
    console.trace()
    console.log(err.stack)
    if (this.browser().isConnected()) return maintenance()
    this.browser().on('connected', maintenance)
  }
}

function dbRec (rec) {
  return JSON.stringify({ts: Date.now(), patch: rec})
}

// Use appendFileSync because:
// - It solves a lot of race issues
// - It's really fast for tiny files, so won't really hold up main loop
Brain.prototype._saveDb = function _saveDb (patch) {
  if (!R.isArrayLike(patch)) patch = [patch]
  if (patch.length === 0) return
  var str = patch.map(dbRec).join('\n') + '\n'
  fs.appendFileSync(this._dbPath(), str)
  J.apply(this.db, patch)
}

Brain.prototype._isPendingScreen = function _isPendingScreen () {
  return R.contains(this.state, ['goodbye'])
}

Brain.prototype.clearPendingTx = function clearPendingTx () {
  if (this.db.pendingTx) this._saveDb({op: 'remove', path: '/pendingTx'})
}

Brain.prototype.handlePendingTx = function handlePendingTx (cb) {
  return cb()
  /*
  This remains disabled until we provide script to allow manual cancelling
  if (!this.db.pendingTx) return cb()

  var tx = this.db.pendingTx
  console.log('Sending pending tx from before power off')
  this.trader.sendCoins(tx, function (err, transactionId) {
    if (err) console.log('Error sending previous pending tx: ' + err)
    else console.log('Successfully sent previous pending tx: %s', tx.id)

    cb()
  })
  */
}

Brain.prototype._idle = function _idle (locale) {
  var self = this
  var delay = transitionTime
  ? MIN_SCREEN_TIME - (Date.now() - transitionTime)
  : 0

  if (delay > 0 && self._isPendingScreen()) {
    setTimeout(function () { self._idle(locale) }, delay)
    return
  }

  if (!this.pairing.isPaired() && !this.trader.isMock) return this._unpaired()
  this.getBillValidator().lightOff()
  this.idVerify.reset()
  this.currentPhoneNumber = null
  this.currentSecurityCode = null
  this.secured = false
  this.rejected = false
  this.redeem = false
  this.tx = {id: generateId()}
  this.numCoins = this.trader.coins.length
  this._resetState()

  this._setState('pendingIdle')

  if (this.networkDown) return this._networkDown()

  // TODO: Once jsonquest is cleaned up, this should be called on final
  // sendCoins success
  this.clearPendingTx()

  var localeInfo = _.cloneDeep(this.localeInfo)
  locale = locale || localeInfo.primaryLocale
  localeInfo.primaryLocale = locale

  this.localeInfo = localeInfo

  // We've got our first contact with server
  if (this.trader.twoWayMode && this.cartridges()) {
    this._idleTwoWay(self.localeInfo)
  } else {
    this._idleOneWay(self.localeInfo)
  }
}

Brain.prototype._chooseCoin = function _chooseCoin (cryptoCode) {
  this.cryptoCode = cryptoCode
  this.browser().send({cryptoCode: cryptoCode})
  this.sendRates()
  this.startScreen()
}

Brain.prototype.cartridges = function cartridges () {
  return this.db.dispense.cartridges
}

Brain.prototype.wasSingleCrypto = function wasSingleCrypto () {
  return this.numCoins === 1
}

Brain.prototype.singleCrypto = function singleCrypto () {
  return this.trader.coins.length === 1
}

Brain.prototype.twoWayMode = function twoWayMode () {
  return this.trader.twoWayMode && this.cartridges()
}

Brain.prototype.smsCompliance = function smsCompliance () {
  var self = this
  var flow = new sms.Flow()
  this.flow = flow

  flow.on('screen', function (rec) {
    self._transitionState(rec.screen, {context: 'compliance'})
  })

  flow.on('idle', function () { self.flow = null; self._idle() })

  flow.on('sendCode', function (phone) {
    self.trader.phoneCode(phone, function (err, result) {
      console.log('DEBUG13')
      if (err && err.name === 'BadNumberError') {
        return flow.handle('badPhoneNumber')
      }

      if (err) {
        console.log(err.stack)
        return flow.handle('networkError')
      }

      console.log('DEBUG14: %s', result.code)
      flow.handle('requiredSecurityCode', result.code)
    })
  })

  flow.on('success', function () {
    self.flow = null
    self.startScreen(true)
  })

  flow.handle('start')
}

Brain.prototype.complianceAlways = function complianceAlways () {
  return true
}

Brain.prototype.startScreen = function startScreen (compliant) {
  if (this.complianceAlways() && !compliant) {
    return this.smsCompliance()
  }

  if (this.singleCrypto() && this.trader.twoWayMode && this.cartridges()) {
    return this._transitionState('dualIdle')
  }

  if (this.singleCrypto()) {
    return this._transitionState('idle')
  }

  if (this.trader.twoWayMode && this.cartridges()) {
    return this._timedState('dualIdle')
  }

  this._start()
}

Brain.prototype._idleTwoWay = function _idleTwoWay (localeInfo) {
  var self = this
  var cartridges = this.cartridges()
  var virtualCartridges = this.trader.virtualCartridges
  var uiCartridges = buildUiCartridges(cartridges, virtualCartridges)
  this.uiCartridges = uiCartridges

  if (!this.billDispenser) {
    this.billDispenser = this.rootConfig.mockBillDispenser
    ? require('./mocks/billdispenser').factory(this.rootConfig.billDispenser)
    : require('./billdispenser').factory(this.rootConfig.billDispenser)
  }

  if (!this.billDispenser.initialized) this._transitionState('booting')
  if (this.billDispenser.initializing) return

  this.billDispenser.init({
    cartridges: this.cartridges(),
    currency: this.trader.locale.currency
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
  var self = this
  this._idle(data.locale)
  this._screenTimeout(function () { self._idle() }, 30000)
}

Brain.prototype._balanceLow = function _balanceLow () {
  var self = this

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

  var fiatBalance = this.balance()
  var highestBill = this.getBillValidator().highestBill(fiatBalance)

  if (!highestBill) return this._balanceLow()
  this._startAddressScan()
}

Brain.prototype._startIdScan = function _startIdScan () {
  var self = this
  var txId = this.tx.id
  this._transitionState('scanId', {beep: true})
  this.idVerify.reset()
  this.getBillValidator().lightOn()

  this.scanner.scanPDF417(function (err, result) {
    self.startDisabled = false
    self.billValidator.lightOff()
    clearTimeout(self.screenTimeout)

    if (err) throw err
    var startState = _.contains(['scanId', 'goodbye'], self.state)
    var freshState = self.tx.id === txId && startState
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
  var self = this
  var lastState = 'on'
  var onInterval = this.config.scanLightOnInterval
  var offInterval = this.config.scanLightOffInterval
  var smallInterval = gcd(onInterval, offInterval)
  var onSkip = onInterval / smallInterval
  var offSkip = offInterval / smallInterval
  var count = 0

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
  var self = this
  var txId = this.tx.id

  this._startAlternatingLight()
  this.scanner.scanMainQR(this.cryptoCode, function (err, address) {
    self._stopAlternatingLight()
    clearTimeout(self.screenTimeout)
    self.startDisabled = false

    if (err) self.emit('error', err)
    var startState = _.contains(['scanAddress', 'goodbye'], self.state)
    var freshState = self.tx.id === txId && startState

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
  var beep = options && options.beep
  this._transitionState('verifyingId', {beep: beep})
  var self = this
  this.idVerify.verifyUser(function (err, result) {
    if (!err && result.success) return self._firstBill()

    // The rest of these screens require user input and need a timeout
    var nextState
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
  var paddedCode = String('0000' + code).slice(-4)  // Pad with zeros
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
  var staticStates = ['chooseCoin', 'idle', 'pendingIdle', 'dualIdle',
    'networkDown', 'unpaired', 'maintenance', 'virgin', 'wifiList']

  return R.contains(this.state, staticStates)
}

Brain.prototype._needsIdleRefresh = function _needsIdleRefresh () {
  var trader = this.trader

  if (this.singleCrypto()) {
    if (this.state === 'idle' && trader.twoWayMode) return true
    if (this.state === 'dualIdle' && !trader.twoWayMode) return true
    return false
  }
}

Brain.prototype.balance = function balance () {
  var cryptoCode = this.cryptoCode
  if (!cryptoCode) throw new Error('No cryptoCode, this shouldn\'t happen')
  return this.trader.balances[cryptoCode]
}

Brain.prototype.sendRates = function sendRates () {
  var cryptoCode = this.cryptoCode
  if (!cryptoCode) return

  var rec = {
    currency: this.currency,
    rates: {
      rates: this.trader.rates(cryptoCode),
      cryptoCode: cryptoCode,
      coins: coins
    },
    coins: this.trader.coins,
    twoWayMode: this.twoWayMode()
  }

  this.browser().send(rec)
}

Brain.prototype._pollUpdate = function _pollUpdate () {
  var locale = this.trader.locale
  this.currency = locale.currency
  this.localeInfo = locale.localeInfo

  this.sendRates()
  var cartridgeWasReset = this._resetCartridges()

  if (!this.isIdleState()) return

  var coinsChanged = this.numCoins !== this.trader.coins.length

  var refresh = this._needsIdleRefresh() ||
  cartridgeWasReset ||
  coinsChanged

  if (refresh) this._idle()
}

Brain.prototype._networkDown = function _networkDown () {
  this.networkDown = true
  if (_.contains(BILL_ACCEPTING_STATES, this.state)) {
    this.getBillValidator().disable()
    this.browser().send({sendOnly: true, reason: 'networkDown'})
    return
  }
  if (!this.isStaticState()) return
  this._forceNetworkDown()
}

Brain.prototype._forceNetworkDown = function _forceNetworkDown () {
  var self = this
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
  if (_.contains(['networkDown', 'connecting', 'wifiConnected'], this.state)) {
    this._restart()
  }
}

Brain.prototype._timedState = function _timedState (state, opts) {
  var self = this
  opts = opts || {}

  if (this.state === state) {
    // console.trace('WARNING: Trying to set to same state: %s', state)
    return
  }
  var timeout = opts.timeout || 30000
  var handler = opts.revertState
  ? function () { self._transitionState(opts.revertState) }
  : function () { self._idle() }

  this._transitionState(state, opts.data)
  this._screenTimeout(handler, timeout)
}

Brain.prototype._transitionState = function _transitionState (state, auxData) {
  // TODO refactor code to use this
  // If we're in maintenance state, we stay there till we die
  if (this.state === state || this.state === 'maintenance') return false
  var rec = {action: state}
  if (auxData) _.merge(rec, auxData)
  transitionTime = Date.now()
  this._setState(state)
  this.browser().send(rec)
  return true
}

Brain.prototype._cryptoFractionalDigits = function _cryptoFractionalDigits (amount) {
  var log = Math.floor(Math.log(amount) / Math.log(10))
  return (log > 0) ? 2 : 2 - log
}

Brain.prototype._restart = function _restart () {
  if (this.billsPending) console.trace('billsPending restart')
  console.assert(!this.billsPending, "Shouldn't restart, bills are pending!")
  this._resetState()
  this.getBillValidator().disable()
  this._idle()
}

Brain.prototype._assertState = function _assertState (expected) {
  var actual = this.state
  console.assert(actual === expected,
    'State should be ' + expected + ', is ' + actual)
}

Brain.prototype._handleScan = function _handleScan (address) {
  this.cryptoAddress = address
  var checkId = this.trader.idVerificationEnabled
  if (checkId) return this._startIdScan()
  this._firstBill()
}

function generateId () {
  return uuid.v4()
}

Brain.prototype._firstBill = function _firstBill () {
  var address = this.cryptoAddress

  var txRec = {
    txId: this.tx.id,
    toAddress: address,
    cryptoCode: this.cryptoCode,
    currency: this.currency
  }

  this._saveDb({op: 'add', path: '/txs', value: txRec})

  this.browser().send({action: 'scanned', buyerAddress: address})
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
  var billValidator = this.getBillValidator()

  if (!R.contains(this.state, BILL_ACCEPTING_STATES)) {
    console.trace('Attempting to reject, not in bill accepting state.')
    return billValidator.reject()
  }

  this._createPendingTransaction(data.denomination)

  var totalFiat = this.credit.fiat + this.pending.fiat

  // Trader balance is balance as of start of user session.
  // Reduce it by fiat we owe user.
  var fiatBalance = this.balance() - totalFiat

  var txLimit = this.trader.txLimit

  if (txLimit && totalFiat > txLimit || fiatBalance < 0) {
    console.log('DEBUG: Out of cash, attempting reject')
    billValidator.reject()
    this.pending = null

    var highestBillTxLimit = txLimit
    ? billValidator.highestBill(txLimit - this.credit.fiat)
    : Infinity

    var newFiatBalance = this.balance() - this.credit.fiat
    var highestBillBalance = billValidator.highestBill(newFiatBalance)

    var lowestHighestBill = Math.min(highestBillTxLimit, highestBillBalance)

    var reason = lowestHighestBill === highestBillTxLimit
    ? 'transactionLimit'
    : 'lowBalance'

    if (!lowestHighestBill) {
      console.log('DEBUG: low balance, attempting disable')
      billValidator.disable()
      this.browser().send({
        sendOnly: true,
        cryptoCode: this.cryptoCode
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
    readingBill: this.pending.fiat
  })
  this._setState('billRead')
}

Brain.prototype._billValid = function _billValid () {
  var trader = this.trader

  this._transitionState('acceptingBills')
  var pending = this.pending

  // No going back
  this.billsPending = true

  var totalFiat = this.credit.fiat + this.pending.fiat
  var fiatBalance = this.balance() - totalFiat

  var txLimit = trader.txLimit
  var billValidator = this.getBillValidator()
  var sendOnly = false

  if (txLimit !== null && totalFiat + billValidator.lowestBill() > txLimit) {
    sendOnly = 'transactionLimit'
  }

  var highestBill = billValidator.highestBill(fiatBalance)
  if (!highestBill) sendOnly = true

  if (sendOnly) {
    billValidator.disable()
  }

  this.browser().send({
    credit: this._uiCredit(),
    sendOnly: sendOnly,
    cryptoCode: this.cryptoCode
  })

  // Update running total
  this.pending = null
  this.credit.fiat += pending.fiat
  this.credit.cryptoAtoms = this.truncateCrypto(this.credit.cryptoAtoms.plus(pending.cryptoAtoms))
  this.credit.lastBill = pending.fiat

  var self = this

  var tradeRec = R.merge(pending, {
    uuid: uuid.v4(),  // bill ID
    currency: this.currency,
    deviceTime: Date.now(),
    toAddress: this.cryptoAddress,
    txId: this.tx.id
  })

  var billRec = {
    txId: this.tx.id,
    currency: this.currency,
    toAddress: this.cryptoAddress,
    cryptoAtoms: tradeRec.cryptoAtoms,
    cryptoCode: tradeRec.cryptoCode,
    fiat: tradeRec.fiat
  }

  this._saveDb({op: 'add', path: '/billInserts', value: billRec})

  trader.trade(tradeRec, function () {})

  this._screenTimeout(function () { self._sendCoins() },
    this.config.billTimeout)
}

// TODO: clean this up
Brain.prototype._billRejected = function _billRejected () {
  var self = this
  if (!R.contains(this.state, BILL_ACCEPTING_STATES)) return

  this.pending = null
  var returnState = this.credit.fiat === 0
  ? 'acceptingFirstBill'
  : 'acceptingBills'

  this._transitionState(returnState)

  this._screenTimeout(function () {
    returnState === 'acceptingFirstBill'
    ? self._restart()
    : self._sendCoins()
  }, this.config.billTimeout)

  var credit = this._uiCredit()
  if (!credit.fiat || credit.fiat === 0) credit = null
  var response = {
    action: 'rejectedBill',
    credit: credit
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
  var credit = this.credit
  var fiat = credit.fiat
  var cryptoAtoms = credit.cryptoAtoms
  var lastBill = null

  if (this.pending) {
    var pending = this.pending
    fiat += pending.fiat
    cryptoAtoms = this.truncateCrypto(cryptoAtoms.plus(pending.cryptoAtoms))
    lastBill = pending.fiat
  } else {
    lastBill = credit.lastBill
  }

  return {
    cryptoCode: this.cryptoCode,
    fiat: fiat,
    cryptoAtoms: cryptoAtoms,
    lastBill: lastBill
  }
}

// This function rounds precision so that the displayed amount matches
// amount actually sent.
Brain.prototype.truncateCrypto = function truncateCrypto (cryptoAtoms) {
  var scale = coins[this.cryptoCode].displayScale
  var scaleFactor = new BigNumber(10).pow(scale)

  return new BigNumber(cryptoAtoms).truncated().div(scaleFactor)
  .round(DECIMAL_PLACES).times(scaleFactor)
}

Brain.prototype._createPendingTransaction = function _createPendingTransaction (bill) {
  console.assert(this.pending === null, "pending is null, can't start tx")
  var unitScale = coins[this.cryptoCode].unitScale
  var unitScaleFactor = new BigNumber(10).pow(unitScale)
  var exchangeRate = this.trader.rates(this.cryptoCode).cashIn
  var cryptoAtoms = this.truncateCrypto(new BigNumber(bill).div(exchangeRate).mul(unitScaleFactor))

  this.pending = {
    fiat: bill,
    exchangeRate: exchangeRate,
    cryptoAtoms: cryptoAtoms,
    cryptoCode: this.cryptoCode
  }
}

Brain.prototype._sendCoins = function _sendCoins () {
  this.browser().send({
    action: 'cryptoTransferPending',
    buyerAddress: this.cryptoAddress
  })

  if (this.state === 'acceptingBills') this._doSendCoins()
}

Brain.prototype._doSendCoins = function _doSendCoins () {
  if (this.state !== 'acceptingBills') return
  this._setState('cryptosSent')
  this._executesendCoins()
}

Brain.prototype._executesendCoins = function _executesendCoins () {
  this.getBillValidator().disable()

  this.pending = null

  this.lastTransaction = {
    address: this.cryptoAddress,
    credit: this._uiCredit()
  }

  var self = this
  var cryptoAtoms = this.credit.cryptoAtoms

  this._verifyTransaction()

  var tx = {
    id: this.tx.id,
    toAddress: this.cryptoAddress,
    cryptoAtoms: cryptoAtoms,
    satoshis: cryptoAtoms,  // backwards compatibility
    currencyCode: this.currency,
    fiat: this.credit.fiat,
    cryptoCode: this.cryptoCode
  }

  this._saveDb({op: 'add', path: '/pendingTx', value: tx})

  this.trader.sendCoins(tx, function (err, res) {
    var txId = res.txId
    if (tx.id !== txId) return
    if (err) self._sendCoinsError(err)
    else self._cashInComplete(txId)
  })
}

// Giving up, go to special screens asking user to contact operator
Brain.prototype._sendCoinsError = function _sendCoinsError (err) {
  console.log('Error sending cryptos: %s', err.message)

  var withdrawFailureRec = {
    credit: this._uiCredit(),
    txId: this.tx.id
  }

  // Giving up
  this.billsPending = false
  this._resetState()

  var self = this
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
  this._resetState()
  this._screenTimeout(this._completed.bind(this), this.config.completedTimeout)
}

Brain.prototype._verifyTransaction = function _verifyTransaction () {
  if (!this.idVerify.inProgress()) return

  var transaction = {
    toAddress: this.cryptoAddress,
    currencyCode: this.currency,
    fiat: this.credit.fiat,
    buyOrSell: 'buy'
  }
  this.idVerify.addTransaction(transaction)
  this.idVerify.verifyTransaction(function (err) { console.log(err) })
}

Brain.prototype._screenTimeoutHandler = function _screenTimeoutHandler (callback) {
  this.currentScreenTimeout = null
  callback()
}

Brain.prototype._screenTimeout = function _screenTimeout (callback, timeout) {
  var self = this

  if (this.currentScreenTimeout) {
    clearTimeout(this.currentScreenTimeout)
    this.currentScreenTimeout = null
  }

  this.currentScreenTimeout =
    setTimeout(function () { self._screenTimeoutHandler(callback) }, timeout)
}

Brain.prototype._timeoutToIdle = function _timeoutToIdle (timeout) {
  var self = this
  this._screenTimeout(function () { self._idle() }, timeout)
}

Brain.prototype._completed = function _completed () {
  if (this.state === 'goodbye' || this.state === 'maintenance') return
  if (this._isTestMode()) return this._testModeOff()

  this._transitionState('goodbye')

  var elapsed = Date.now() - this.bootTime
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
  var self = this
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

Brain.prototype._fixTransaction = function _fixTransaction () {
  this._setState('fixTransaction')
  this.browser().send({
    action: 'fixTransaction',
    lastTransaction: this.lastTransaction
  })
}

Brain.prototype._abortTransaction = function _abortTransaction () {
  this.billsPending = false
  this._restart()
}

Brain.prototype._resetState = function _resetState () {
  if (this.billsPending) console.log('*** WARNING: Reset when bills are pending ***')
  this.cryptoAddress = null
  this.credit.fiat = 0
  this.credit.cryptoAtoms = new BigNumber(0)
  this.credit.lastBill = null
  this.pending = null
}

Brain.prototype._setupCheckPower = function _setupCheckPower () {
  var self = this
  setInterval(function () {
    self._checkPower()
  }, this.config.checkPowerTime)
}

// This can only get called when we're not in a transaction
Brain.prototype._checkPower = function _checkPower () {
  if (!this.isStaticState()) return

  // TODO: factor this out to a device-specific module
  var powerStatusPath = this.config.powerStatus
  if (!powerStatusPath) return

  var self = this
  fs.readFile(powerStatusPath, {encoding: 'utf8'}, function (err, res) {
    if (err) {
      console.log(err.stack)
      return
    }
    if (res.match(/^Discharging/)) {
      console.log('Sensed power down.')
      self.powerDown = true
      var elapsed = Date.now() - self.lastPowerUp > self.config.checkPowerTimeout
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
  var self = this

  console.log('Unpairing')
  self.trader.stop()
  self.pairing.unpair(function () {
    console.log('Unpaired. Rebooting...')
    self._setState('unpaired')
    self.browser().send({action: 'unpaired'})
    setTimeout(function () { self._restartService('Unpair') }, 2000)
  })
}

Brain.prototype._billValidatorErr = function _billValidatorErr (err) {
  var self = this
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

Brain.prototype._effectiveBills = function _effectiveBills () {
  var cartridges = this.cartridges()
  var reservedBills = R.pluck('bills', R.values(this.db.dispense.reserved.sessions))
  var reservedBillsSum = BillMath.sumChange(reservedBills)

  return [
    {
      denomination: cartridges[0].denomination,
      count: cartridges[0].count - reservedBillsSum[0].count
    },
    {
      denomination: cartridges[1].denomination,
      count: cartridges[1].count - reservedBillsSum[1].count
    }
  ]
}

Brain.prototype._getFiatButtonResponse = function _getFiatButtonResponse () {
  var tx = this.tx
  var cartridges = this.cartridges()
  var virtualCartridges = this.trader.virtualCartridges
  var txLimit = this.trader.fiatTxLimit
  var txAmount = tx.fiat
  var effectiveBills = this._effectiveBills()

  function denominationIsAvailable (denom) {
    var pendingAmount = txAmount + denom
    return !!BillMath.makeChange(effectiveBills, pendingAmount)
  }

  function denominationUnderLimit (denom) {
    var pendingAmount = txAmount + denom
    return pendingAmount <= txLimit
  }

  var denominationIsActive = R.both(denominationUnderLimit, denominationIsAvailable)
  var denoms = R.union(virtualCartridges, R.pluck('denomination', cartridges))
  var activeDenoms = R.zip(denoms, R.map(denominationIsActive, denoms))
  var activeMap = R.fromPairs(activeDenoms)
  var noMore = !R.any(R.identity, R.values(activeMap))
  var txLimitReached = noMore && R.any(denominationIsAvailable, denoms)
  var isEmpty = noMore && !txLimitReached

  var response = {
    credit: tx,
    activeDenominations: {
      isEmpty: isEmpty,
      txLimitReached: txLimitReached,
      activeMap: activeMap
    }
  }

  return response
}

Brain.prototype._outOfCash = function _outOfCash () {
  var self = this

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
  var txId = this.tx.id
  this.tx = R.merge({
    fiat: 0,
    cryptoAtoms: new BigNumber(0),
    currencyCode: this.currency,
    toAddress: null,
    cryptoCode: this.cryptoCode,
    direction: 'cashOut'
  }, this.tx)

  var response = this._getFiatButtonResponse()
  if (response.activeDenominations.isEmpty) return this._outOfCash()

  this._transitionState('chooseFiat', {chooseFiat: response})
  var self = this
  this.dirtyScreen = false
  var interval = setInterval(function () {
    var doClear = self.state !== 'chooseFiat' ||
      self.tx.id !== txId
    if (doClear) return clearInterval(interval)

    var isDirty = self.dirtyScreen
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
  var response = this._getFiatButtonResponse()
  this.browser().send({fiatCredit: response})
}

Brain.prototype._fiatButton = function _fiatButton (data) {
  var denomination = parseInt(data.denomination, 10)
  var tx = this.tx

  var buttons = this._getFiatButtonResponse()

  // We should always have enough available if the button could be pressed,
  // just double-checking
  var rate = this.trader.rates(this.cryptoCode).cashOut
  var unitScale = new BigNumber(10).pow(coins[this.cryptoCode].unitScale)

  if (buttons.activeDenominations.activeMap[denomination]) {
    var cryptoAtoms = new BigNumber(denomination).div(rate).times(unitScale).truncated()
    tx.fiat += denomination
    tx.cryptoAtoms = this.truncateCrypto(tx.cryptoAtoms.plus(cryptoAtoms))
  }

  this._fiatButtonResponse()
}

Brain.prototype._clearFiat = function _clearFiat () {
  var tx = this.tx

  tx.fiat = 0
  tx.cryptoAtoms = new BigNumber(0)

  this._fiatButtonResponse()
}

Brain.prototype._registerPhone = function _registerPhone () {
  this._transitionState('registerPhone', {context: this.redeem ? 'redeem' : 'deposit'})
}

Brain.prototype._registerCode = function _registerCode () {
  this._transitionState('registerCode')
}

Brain.prototype._sendSecurityCode = function _sendSecurityCode (number) {
  var self = this

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
  var self = this

  if (!this.redeem) return this._sendSecurityCode(number)

  // *** Backwards compatibility with Raqia. Remove after Raqia decomission.
  var cb = function (err, res) {
    if (err && err.name === 'UnknownPhoneNumberError') {
      return self._timedState('unknownPhoneNumber')
    } else if (err) {
      return self._fiatError(err)
    }
    self.tx = res.tx
    self._sendSecurityCode(number)
  }

  this.trader.fetchPhoneTx(number, function (err, res) {
    if (err && err.name === 'UnknownPhoneNumberError') {
      if (!self.raqia) return cb(err)

      return self.raqia.fetchPhoneTx(number, function (raqiaErr, raqiaRes) {
        if (raqiaErr && raqiaErr.isBoom && raqiaErr.output.statusCode === 404) {
          var _err = new Error('Unknown phone number')
          _err.name = 'UnknownPhoneNumberError'
          return cb(_err)
        }

        if (raqiaErr) return cb(raqiaErr)

        self.trader.updatePhoneNoNotify(raqiaRes.tx, function (updateErr) {
          if (updateErr) return cb(updateErr)
          return self.trader.fetchPhoneTx(number, cb)
        })
      })
    }

    return cb(err, res)
  })
}

Brain.prototype._phoneNumber = function _phoneNumber (number) {
  var self = this

  if (!number) return this._idle()

  process.nextTick(function () { self._processPhoneNumber(number) })
  this._registerCode()
}

Brain.prototype._securityCode = function _securityCode (code) {
  var self = this

  if (!code) return this._idle()

  if (code !== this.currentSecurityCode) {
    return this._timedState('badSecurityCode')
  }

  if (this.redeem && !this.tx) {
    return this._timedState('unconfirmedDeposit')
  }

  this.secured = true
  this.tx.phone = this.currentPhoneNumber

  if (this.redeem) return this._redeemDispense()

  if (this.tx.started) {
    this._transitionState('waiting')
    this.trader.updatePhone(this.tx, function (err) {
      if (err) {
        console.log(err)
        return self._fiatError(err)
      }
      self._cashOut()
    })
    return
  }

  this._cashOut()
}

Brain.prototype._redeemDispense = function _redeemDispense () {
  var tx = this.tx
  var txId = tx.id
  var cartridges = this.cartridges()
  var db = this.db
  var reserved = db.dispense.reserved.sessions[txId]

  if (reserved) {
    if (!BillMath.available(cartridges, reserved.bills)) {
      return this._timedState('outOfCash')
    }

    tx.bills = reserved.bills
    this._unreserveBills(txId)
    this._dispense()
    return
  }

  tx.bills = BillMath.makeChange(this._effectiveBills(), tx.fiat)

  if (!tx.bills) {
    return this._timedState('outOfCash')
  }

  this._dispense()
}

Brain.prototype._cancelPhone = function _cancelPhone () {
  if (this.redeem) return this._idle()
  if (this.rejected) return this._timedState('preReceipt')
  this._idle()
}

Brain.prototype.exceedsZeroConf = function exceedsZeroConf (tx) {
  var coin = coins[tx.cryptoCode]

  if (!coin) throw new Error('Fatal: unsupported coin: ' + tx.cryptoCode)

  return coin.zeroConf && tx.fiat > this.trader.zeroConfLimit
}

Brain.prototype._cashOut = function _cashOut () {
  var self = this
  var tx = this.tx
  var effectiveBills = this._effectiveBills()

  tx.bills = BillMath.makeChange(effectiveBills, tx.fiat)

  // Need this here because user may have indicated he didn't send coins
  // after trader.cashOut().
  this.tx.started = false

  if (this.exceedsZeroConf(tx) && !this.secured) {
    return this._registerPhone()
  }

  if (this.rejected && this.secured) {
    return this._redeemLater()
  }

  this._transitionState('deposit', {tx: tx})

  // User asked for another chance
  if (tx.toAddress) {
    this._waitForDispense('notSeen')
    return this.browser().send({depositInfo: tx})
  }

  this.trader.cashOut(tx, function (err, cryptoAddress) {
    if (err) return self._fiatError(err)

    tx.toAddress = cryptoAddress
    self.tx.started = true

    self.browser().send({depositInfo: tx})
    self._waitForDispense('notSeen')
  })
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
  var tx = this.tx
  this.trader.registerRedeem(tx.id)
  this._reserveBills(tx)
  this._timedState('redeemLater')
}

Brain.prototype._waitForDispense = function _waitForDispense (status) {
  var self = this
  this.trader.waitForDispense(this.tx, status, function (err, tx) {
    if (self.tx.id !== tx.id) return

    if (err) {
      return self._timedState('depositTimeout')
    }

    self._dispenseUpdate(tx)
  })
}

function fullDispense (bills, fiat, cartridges) {
  var len = bills.length
  var total = 0

  for (var i = 0; i < len; i++) {
    total += bills[i].accepted * cartridges[i].denomination
  }

  return total >= fiat
}

function fillInBills (tx, bills) {
  var len = bills.length
  for (var i = 0; i < len; i++) {
    tx.bills[i].actualDispense = bills[i].accepted
    tx.bills[i].rejected = bills[i].rejected
  }
}

Brain.prototype._resetCartridges = function _resetCartridges () {
  var id = this.trader.cartridgesUpdateId
  var cartridges = this.trader.cartridges
  if (!id || !cartridges) return

  var oldId = this.db.dispense.cartridgesUpdateId
  if (id === oldId) return

  var patch = [
    {op: 'replace', path: '/dispense/cartridges', value: cartridges},
    {op: 'replace', path: '/dispense/cartridgesUpdateId', value: id}
  ]
  this._saveDb(patch)

  return true
}

Brain.prototype._updateCartridges = function _updateCartridges (bills) {
  var cartridges = R.clone(this.cartridges())
  var len = bills.length
  for (var i = 0; i < len; i++) {
    cartridges[i].count -= bills[i].accepted + bills[i].rejected
    if (cartridges[i].count < 0) cartridges[i].count = 0
  }

  var patch = {op: 'replace', path: '/dispense/cartridges', value: cartridges}
  this._saveDb(patch)
}

Brain.prototype._fiatError = function _fiatError (err) {
  console.log(err)
  console.trace('DEBUG: _fiatError')
  var state = this.tx.started ? 'fiatTransactionError' : 'fiatError'
  this._timedState(state)
}

Brain.prototype._dispense = function _dispense () {
  var self = this

  this.trader.dispense(this.tx, function (err, txId) {
    // TODO: Already dispensed screen, if applicable

    if (txId !== self.tx.id) return

    if (err) {
      console.log(err.stack)
      return self._fiatError(err)
    }

    self._physicalDispense(self.tx)
  })
}

Brain.prototype._expireReservedBills = function _expireReservedBills () {
  var self = this

  function deleteRec (rec) {
    return {op: 'remove', path: '/dispense/reserved/sessions/' + rec.txId}
  }

  function expireBills () {
    var targetTimestamp = Date.now() - CASH_RESERVE_EXPIRATION
    var isExpired = R.compose(R.gt(targetTimestamp), R.prop('timestamp'))
    var fetchExpired = R.compose(R.filter(isExpired), R.values)
    var expired = fetchExpired(self.db.dispense.reserved.sessions)
    var patch = R.map(deleteRec, expired)
    self._saveDb(patch)
  }

  expireBills()
  setInterval(expireBills, CASH_RESERVE_CHECK)
}

Brain.prototype._reserveBills = function _reserveBills (tx) {
  var txId = tx.id

  if (this.db.dispense.reserved[txId]) {
    return console.log('Warning: bills for transaction already reserved: %s', txId)
  }

  var rec = {
    txId: txId,
    timestamp: Date.now(),
    amount: tx.fiat,
    currency: tx.currencyCode,
    bills: tx.bills
  }
  var path = '/dispense/reserved/sessions/' + txId
  this._saveDb({op: 'add', path: path, value: rec})
}

Brain.prototype._unreserveBills = function _unreserveBills (txId) {
  if (!this.db.dispense.reserved.sessions[txId]) return
  var patch = {op: 'remove', path: '/dispense/reserved/sessions/' + txId}
  this._saveDb(patch)
}

Brain.prototype._physicalDispense = function _physicalDispense (tx) {
  var self = this
  var currency = tx.currencyCode
  var notes = [tx.bills[0].count, tx.bills[1].count]

  if (currency !== this.billDispenser.currency) {
    console.log('Wrong dispenser currency; dispenser: %s, tx: %s',
      this.billDispenser.currency, currency)
    return this._timedState('wrongDispenserCurrency')
  }

  this.billDispenser.dispense(notes, function (err, result) {
    // TODO: More detailed dispense error
    if (err) {
      console.log(err.stack)
      return self._fiatError(err)
    }

    var txId = self.tx.id
    var bills = result.bills

    var tx = self.tx
    var cartridges = self.cartridges()
    var wasFullDispense = fullDispense(bills, tx.fiat, cartridges)
    fillInBills(tx, bills)
    tx.error = result.err
    self._updateCartridges(bills)
    cartridges = self.cartridges()
    self.trader.dispenseAck(tx, cartridges)
    if (!wasFullDispense) {
      return self._transitionState('outOfCash')
    }

    setTimeout(function () {
      var doComplete = self.state === 'fiatComplete' &&
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

  var overZeroConf = this.exceedsZeroConf(tx)
  var status = tx.status
  var needToRedeem = !R.contains(status, ['instant', 'confirmed']) && overZeroConf

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
  var tx = this.tx
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
    var files = fs.readdirSync(path)
    var device = _.find(files, startsWithUSB)
    return device ? '/dev/' + device : null
  } catch (e) {
    console.log('hub path not connected: ' + path)
    return null
  }
}

module.exports = Brain

// *** Temporary, for Raqia compat

var commandLine = require('minimist')(process.argv.slice(2))

Brain.prototype._ensureRaqiaRegistration = function _ensureRaqiaRegistration (cb) {
  var self = this
  var raqiaPath = commandLine.staging
  ? path.resolve(this.dataPath, 'raqia-staging.json')
  : path.resolve(this.dataPath, 'raqia.json')

  if (process.env.NODE_ENV === 'development') {
    raqiaPath = path.resolve(this.dataPath, 'raqia-development.json')
  }

  this.raqia = commandLine.mockRaqia ? require('./mocks/raqia') : require('./raqia')

  if (this.raqia.hasConfig()) return cb()

  fs.readFile(raqiaPath, function (err, res) {
    if (err) {
      self.raqia = null
      return cb()
    }
    self.raqia.configure(JSON.parse(res))
    return cb()
  })
}
