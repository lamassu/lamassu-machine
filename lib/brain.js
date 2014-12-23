'use strict';

var fs = require('fs');
var cp = require('child_process');
var os = require('os');
var path = require('path');
var _ = require('lodash');
var bunyan = require('bunyan');
var uuid = require('uuid');
var async = require('async');

var State = require('./constants/state.js');

var SATOSHI_FACTOR = 1e8;
var PRICE_PRECISION = 5;
var STATIC_STATES = [State.IDLE, State.PENDING_IDLE, State.DUAL_IDLE, State.NETWORK_DOWN,
  State.UNPAIRED];
var BILL_ACCEPTING_STATES = ['billInserted', 'billRead', 'acceptingBills',
  'acceptingFirstBill'];
var INITIAL_STATE = State.START;

var Brain = function(config) {
  if (!(this instanceof Brain)) return new Brain(config);

  this.rootConfig = config;
  this.config = config.brain;

  this.dataPath = path.resolve(__dirname, '..', this.config.dataPath);

  var certs = {
    certFile: path.resolve(this.dataPath, this.config.certs.certFile),
    keyFile: path.resolve(this.dataPath, this.config.certs.keyFile),
  };
  if (config.noCert) certs.certFile = null;

  this.currency = 'USD';
  this.bootTime = Date.now();

  var wifiConfig = config.wifi;
  wifiConfig.wpaConfigPath = wifiConfig.wpaConfigPath &&
    path.resolve(this.dataPath, wifiConfig.wpaConfigPath);
  if (config.mockWifi) {
    this.wifi = require('./mocks/wifi')(wifiConfig);
  }
  else {
    this.wifi = require('./wifi')(wifiConfig);
  }

  this.scanner = config.mockCam ?
    require('./mocks/scanner') :
    require('./scanner');
  this.scanner.config(config.scanner);

  config.id003.rs232.device = determineDevicePath(config.id003.rs232.device);
  config.billDispenser.device = determineDevicePath(config.billDispenser.device);
  if (config.id003Device) config.id003.rs232.device = config.id003Device;

  var connectionInfoPath = path.resolve(this.dataPath,
    this.config.connectionInfoPath);

  var pairingConfig = {
    certs: certs,
    connectionInfoPath: connectionInfoPath
  };
  this.setPairing(require('./pairing')(pairingConfig));

  config.id003.currency = this.currency;
  this.setBillValidator(require('./id003/id003').factory(config.id003));

  var traderConfig = config.trader;
  traderConfig.currency = this.currency;
  traderConfig.lowestBill = this.billValidator().lowestBill();
  traderConfig.certs = certs;
  if (config.http) traderConfig.protocol = 'http';

  var trader = undefined;
  
  if (config.mockTrader) {
    trader = require('./mocks/trader')(traderConfig);
  } else
    trader = require('./trader')(traderConfig);
  
  this.setTrader(trader);

  this.idVerify = require('./compliance/id_verify').factory({trader : trader});

  this.setBrowser(require('./browser')());
  this._setState(INITIAL_STATE);
  this.bitcoinAddress = null;
  this.credit = {fiat: 0, satoshis: 0, lastBill: null};
  this.creditConfirmed = {fiat: 0, satoshis: 0};
  this.fiatTx = null;
  this.pending = null;
  this.billsPending = false;
  this.currentScreenTimeout = null;
  this.locked = true;
  this.wifis = null;
  this.screenTimeout = null;
  this.lastTransation = null;
  this.sendOnValid = false;
  this.lastPowerUp = Date.now();
  this.networkDown = true;
  this.hasConnected = false;
  this.localeInfo = this.config.locale.localeInfo;
  this.dirtyScreen = false;
  this.billValidatorErrorFlag = false;
  this.startDisabled = false;
  this.testModeOn = false;
  this.uiCartridges = null;
  this.txLog = bunyan.createLogger({
    name: 'TX',
    streams: [{
      type: 'rotating-file',
      path: path.resolve(this.dataPath, this.config.transactionLogPath),
      period: '1d',
      count: 360
    }]
  });
};

var EventEmitter = require('events').EventEmitter;
var util = require('util');
util.inherits(Brain, EventEmitter);

Brain.prototype.run = function run() {
  console.log('Bitcoin Machine software initialized.');
  var self = this;
  this._init();
  this._setUpN7();
  this.browser().listen();
  this._transitionState('booting');
  this.checkWifiStatus();
  this._periodicLog();

  var callback = function() {
    self._transitionState('restart');
    console.log('Scheduled restart after idle time.');
    process.exit();
  };

  this._executeCallbackAfterASufficientIdlePeriod(callback);
};

Brain.prototype._executeCallbackAfterASufficientIdlePeriod =
    function _executeCallbackAfterASufficientIdlePeriod(callback) {
	var self = this;
  var config = this.config;
  var exitTime = config.exitTime;
  var exitOnIdle = exitTime + config.idleTime;

  setInterval(function() {
	  if (_.contains(STATIC_STATES, self.state)) {
		var date = new Date();
		var elapsed = (date.getTime()) - self.bootTime;
	    if (elapsed > exitOnIdle) {
	    	callback();
	    }
	  }

  }, this.config.checkIdle);

};

Brain.prototype._periodicLog = function _periodicLog() {
  var self = this;
  var batteryCapacityPath = this.config.batteryCapacityPath;
  var tempSensorPath = this.config.tempSensorPath;

  var tasks = {};
  if (batteryCapacityPath) tasks.battery =
    async.apply(fs.readFile, batteryCapacityPath, {encoding: 'utf8'});
  if (tempSensorPath) tasks.temperature =
    async.apply(fs.readFile, tempSensorPath, {encoding: 'utf8'});

  function reporting() {
    var clauses = ['cpuLoad: %s, memUse: %s, memFree: %s\n  nodeUptime: %s, ' +
      'osUptime: %s'];
    async.parallel(tasks, function (err, results) {
      if (err) return console.log(err);
      if (results.battery) {
        clauses.push('battery: ' + results.battery.trim() + '%');
      }
      if (results.temperature) {
        clauses.push('CPU temperature: ' +
          (results.temperature.trim() / 1000) + '° C');
      }
      var cpuLoad = os.loadavg()[1].toFixed(2);
      var memUse = (process.memoryUsage().rss / Math.pow(1000, 2)).toFixed(1) +
        ' MB';
      var memFree = (os.freemem() * 100 / os.totalmem()).toFixed(1) + '%';
      var nodeUptimeMs = Date.now() - self.bootTime;
      var nodeUptime = (nodeUptimeMs / 3600000).toFixed(2) + 'h';
      var osUptime = (os.uptime() / 3600).toFixed(2) + 'h';
      var format = clauses.join(', ');
      console.log(format, cpuLoad, memUse, memFree, nodeUptime, osUptime);
    });
  }
  reporting();
  setInterval(reporting, this.config.periodicLogInterval);
};

Brain.prototype._connect = function _connect() {
  var self = this;
  if (!this.pairing().hasCert()) this._transitionState('initializing');
  this.pairing().init(function (err) {
    if (err) self.emit('error', err);
    self._startTrading();
  });
};

Brain.prototype._startTrading = function _startTrading() {
  var self = this;
  this.billValidator().run(function (err) {
    if (err) return self._billValidatorErr(err);

    console.log('Bill validator connected.');
    self.trader().init(self.pairing().connectionInfo());

    // We want to wait until heavy CPU heavy certification generation is done
    self.getBillValidator().monitorHeartbeat();

    self.trader().run();
    self._idle();
  });
};

Brain.prototype.checkWifiStatus = function checkWifiStatus() {
  var self = this;
  this.wifi.status(function(err, status, ip) {
    if (err || status === 'pending') {
      if (err) console.log(err.stack);
      if (self.state !== 'wifiConnecting') self._wifiConnecting();
      self.wifi.waitConnection(function(err, ip) {
        if (err) {
          self.wifi.startScanning();
          self._wifiList();
          return;
        }
        self.config.ip = ip;
        self._wifiConnected();
      });
    } else if (status === 'disconnected') {
      self.wifi.startScanning();
      self._wifiList();
    } else if (status === 'connected') {
      self.config.ip = ip;
      self._wifiConnected();
    }
  });
};

Brain.prototype._init = function init() {
  this._initWifiEvents();
  this._initTraderEvents();
  this._initBrowserEvents();
  this._initBillValidatorEvents();
  this._initBrainEvents();
};

Brain.prototype._initWifiEvents = function _initWifiEvents() {
  var self = this;

  this.wifi.on('scan', function(res) {
    self.wifis = res;
    self.browser().send({wifiList: res});
  });

  this.wifi.on('authenticationError', function(data) {
    console.log('authentication error');
    self.wifi.close();
    self._wifiSelect(data);
  });
};

Brain.prototype._initTraderEvents = function _initTraderEvents() {
  var self = this;
  var trader = this.trader();
  
  trader.on(State.POLL_UPDATE, function() { self._pollUpdate(); });
  trader.on(State.NETWORK_DOWN, function() { self._networkDown(); });
  trader.on('networkUp', function() { self._networkUp(); });
  trader.on('dispenseUpdate', function(status) {
    self._dispenseUpdate(status);
  });
  trader.on('error', function(err) { console.log(err.stack); });
  trader.on('unpair', function () { self._unpair(); });
};

Brain.prototype._initBrowserEvents = function _initBrowserEvents() {
  var self = this;
  var browser = this.browser();
  
  browser.on('connected', function() { self._connectedBrowser(); });
  browser.on('message', function(req) { self._processRequest(req); });
  browser.on('closed', function() { self._closedBrowser(); });
  browser.on('messageError', function(err) {
    console.log('Browser error: ' + err.message);
  });
  browser.on('error', function(err) {
    console.log('Browser connect error: ' + err.message);
    console.log('Likely that two instances are running.');
  });
};

Brain.prototype._initBillValidatorEvents = function _initBillValidatorEvents() {
  var self = this;
  var billValidator = this.billValidator();
  
  billValidator.on('error', function(err) { self._billValidatorErr(err); });
  billValidator.on('disconnected', function() { self._billValidatorErr(); });
  billValidator.on('billAccepted', function() { self._billInserted(); });
  billValidator.on('billRead', function(data) { self._billRead(data); });
  billValidator.on('billValid', function() { self._billValid(); });
  billValidator.on('billRejected', function() { self._billRejected(); });
  billValidator.on('timeout', function() { self._billTimeout(); });
  billValidator.on('standby', function() { self._billStandby(); });
  billValidator.on('jam', function() { self._billJam(); });
  billValidator.on('stackerOpen', function() { self._stackerOpen(); });
  billValidator.on('enabled', function(data) { self._billsEnabled(data); });
};

Brain.prototype._initBrainEvents = function _initBrainEvents() {
  this.on('newState', function(state) {
    console.log('new brain state:', state);
  });
};

// TODO: abstract this
Brain.prototype._setupWebcam = function _setupWebcam() {
  var rootPath = '/sys/bus/usb/devices/2-1';

  if (!fs.existsSync(rootPath)) return;

  var subdirs = fs.readdirSync(rootPath);
  subdirs.forEach(function(dir) {
    if (dir.indexOf('2-1') === 0) {
      var autosuspendPath = rootPath + '/' + dir + '/power/autosuspend';
      try {
        fs.writeFileSync(autosuspendPath, '-1');
      } catch (ex) {
        // File doesn't exist, that's ok.
      }
    }
  });
};

Brain.prototype._setUpN7 = function _setUpN7() {
  var backlightPath = '/sys/class/backlight/pwm-backlight/brightness';
  if (fs.existsSync(backlightPath)) fs.writeFileSync(backlightPath, '160\n');
  this._setupWebcam();
  this._setupCheckPower();
};

Brain.prototype._connectedBrowser = function _connectedBrowser() {
//  TODO: have to work on this: console.assert(this.state === State.IDLE);
  console.log('connected to browser');

  var rec = {
    action: this.state,
    localeInfo: this.localeInfo,
    currency: this.currency,
    exchangeRate: this._exchangeRateRec(this.trader().exchangeRate),
    fiatExchangeRate: this.trader().fiatExchangeRate,
    cartridges: this.uiCartridges
  };

  if (this.state === 'wifiList' && this.wifis) rec.wifiList = this.wifis;
  this.browser().send(rec);
};

Brain.prototype._processRequest = function _processRequest(req) {
  this._processReal(req);
};

Brain.prototype._processReal = function _processReal(req) {
  switch(req.button) {
    case 'locked':
      this._locked();
      break;
    case 'unlock':
      this._unlock(req.data);
      break;
    case 'cancelLockPass':
      this._cancelLockPass();
      break;
    case 'wifiSelect':
      this._wifiPass(req.data);
      break;
    case 'wifiConnect':
      this._wifiConnect(req.data);
      break;
    case 'cancelWifiList':
      this._cancelWifiList();
      break;
    case 'cancelWifiPass':
      this._cancelWifiPass();
      break;
    case 'initialize':
      this._connect();
      break;
    case 'pairingScan':
      this._pairingScan();
      break;
    case 'pairingScanCancel':
      this.scanner.cancel();
      this._idle();
      break;
    case 'testMode':
      this._testMode();
      break;
    case State.START:
      this._start();
      break;
    case 'idCode':
      this._idCode(req.data);
      break;
    case 'cancelIdScan':
      this._cancelIdScan();
      break;
    case 'cancelIdCode':
      this._cancelIdCode();
      break;
    case 'idVerificationFailedOk':
    case 'idCodeFailedCancel':
    case 'idVerificationErrorOk':
      this._restart();
      break;
    case 'idCodeFailedRetry':
      this._transitionState('idCode');
      break;
    case 'cancelScan':
      this._cancelScan();
      break;
    case 'cancelInsertBill':
      this._cancelInsertBill();
      break;
    case 'sendBitcoins':
      this._sendBitcoins();
      break;
    case 'completed':
      this._completed();
      break;
    case 'machine':
      this._machine();
      break;
    case 'cancelMachine':
      this._cancelMachine();
      break;
    case 'powerOff':
      this._powerOffButton();
      break;
    case 'cam':
      this._cam();
      break;
    case 'fixTransaction':
      this._fixTransaction();
      break;
    case 'abortTransaction':
      this._abortTransaction();
      break;
    case 'startFiat':
      this._chooseFiat();
      break;
    case 'chooseFiatCancel':
      this._chooseFiatCancel();
      break;
    case 'fiatButton':
      this._fiatButton(req.data);
      break;
    case 'clearFiat':
      this._clearFiat();
      break;
    case 'depositCancel':
      this._idle();
      break;
    case 'cashOut':
      this._cashOut();
      break;
    case State.IDLE:
      this._idle();
      break;
  }
};

Brain.prototype._setState = function _setState(state, oldState) {
  if (this.state === state) return;

  if (oldState) this._assertState(oldState);

  if (this.currentScreenTimeout) {
    clearTimeout(this.currentScreenTimeout);
    this.currentScreenTimeout = null;
  }
  this.state = state;
  this.emit(state);
  this.emit('newState', state);
};

Brain.prototype._locked = function _locked() {
  this._setState('lockedPass', 'locked');
  this.browser().send({action: 'lockedPass'});
};

Brain.prototype._unlock = function _unlock() {
  this._wifiList();
};

Brain.prototype._cancelLockPass = function _cancelLockPass() {
  this._setState('locked', 'lockedPass');
  this.browser().send({action: 'locked'});
};

Brain.prototype._wifiList = function _wifiList() {
  this._setState('wifiList');
  this.browser().send({action: 'wifiList'});
};

Brain.prototype._wifiPass = function _wifiPass(data) {
  this.browser().send({action: 'wifiPass', wifiSsid: data});
  this.wifi.stopScanning();
  this._setState('wifiPass');
  console.log('connecting to %s', data.ssid);
};

Brain.prototype._wifiConnect = function _wifiConnect(data) {
  this._setState('wifiConnecting', 'wifiPass');
  this.browser().send({action: 'wifiConnecting'});
  var rawSsid = data.rawSsid;
  var ssid = data.ssid;
  var self = this;
  this.wifi.connect(rawSsid, ssid, data.pass, function(err, ip) {
    if (err) {
      // TODO: error screen
      console.log(err.stack);
      var ssidData = {
        ssid: ssid,
        displaySsid: self.wifi.displaySsid(ssid)
      };
      self._wifiPass(ssidData);
    } else {
      self.config.ip = ip;
      self._wifiConnected();
    }
  });
};

Brain.prototype._cancelWifiList = function _cancelWifiList() {
//  this._setState('locked', 'wifiList');
//  this.browser().send({action: 'locked'});
};

Brain.prototype._cancelWifiPass = function _cancelWifiPass() {
  this.browser().send({action: 'wifiList'});
  this.wifi.startScanning();
  this._setState('wifiList', 'wifiPass');
};

Brain.prototype._wifiConnecting = function _wifiConnecting() {
  this._setState('wifiConnecting');
  this.browser().send({action: 'wifiConnecting'});
};

Brain.prototype._wifiConnected = function _wifiConnected() {
  if (this.state === 'maintenance') return;
  this._setState('wifiConnected');

  if (!this.pairing().hasCert()) return this._transitionState('virgin');
  this._connect();
};

Brain.prototype._unpair = function _unpair() {
  var self = this;

  console.log('Unpairing');
  self.trader().stop();
  self.pairing().unpair(function () {
    console.log('Unpaired');
    self._setState(State.UNPAIRED);
    self.browser().send({action: State.UNPAIRED});
  });
};

Brain.prototype._unpaired = function _unpaired() {
  this._setState(State.UNPAIRED);
  this.browser().send({action: State.UNPAIRED});
};

Brain.prototype._pairingScan = function _pairingScan() {
  var self = this;
  this._setState('pairingScan');
  this.browser().send({action: 'pairingScan'});

  this.scanner.camOn();
  this.scanner.scanPairingCode(function(err, json) {
    self.scanner.camOff();
    if (err) return self._pairingError(err);
    if (json === null) return self._restart();
    self._pair(json);
  });
};

Brain.prototype._pair = function _pair(json) {
  var self = this;
  this._transitionState('pairing');
  this.pairing().pair(json, function (err, connectionInfo) {
    if (err) return self._pairingError(err);
    self.trader().pair(connectionInfo);
    self._idle();
  });
};

Brain.prototype._pairingError = function _pairingError(err) {
  this._setState('pairingError');
  this.browser().send({action: 'pairingError', err: err.message});
};

Brain.prototype._isTestMode = function _isTestMode() {
  return this.testModeOn;
};

Brain.prototype._testMode = function _testMode() {
  var self = this;
  this.testModeOn = true;
  this.traderOld = this.trader();
  this.trader().removeAllListeners();
  this.setTrader(require('./mocks/trader')());
  this._initTraderEvents();
  this.pairing()._connectionInfo = {};
  this.networkDown = false;
  this.billValidator().run(function () {
	  self.trader().run();
    self._idle();
  });
};

Brain.prototype._testModeOff = function _testModeOff() {
  var self = this;
  this.billValidator().close(function() {
    self.testModeOn = false;
    self.pairing()._connectionInfo = null;
    self.trader().removeAllListeners();
    self.setTrader(self.traderOld);
    self._initTraderEvents();
    self._transitionState('virgin');
  });
};

function buildUiCartridges(cartridges, virtualCartridges) {
  var result = _.cloneDeep(cartridges);

  // TODO: Generalize, if we ever need more than 1 virtual cartridge
  result.push({denomination: virtualCartridges[0], count: null});
  return _.sortBy(result, 'denomination');
}

Brain.prototype._idle = function _idle() {
  var trader = this.trader();
  var pairing = this.pairing();
  
  if (!pairing.isPaired() && !trader.isMock) return this._unpaired();
  trader.sessionId = uuid.v4();
  console.log('New sessionId: %s', trader.sessionId);
  this.billValidator().lightOff();
  this.idVerify.reset();

  this._setState(State.PENDING_IDLE);

  if (this.networkDown) return this._networkDown();

  // We've got our first contact with server
  if (trader.twoWayMode) this._idleTwoWay();
  else this._idleOneWay();
};

Brain.prototype._idleTwoWay = function _idleTwoWay() {
  var self = this;
  var cartridges = this.trader().cartridges;
  var virtualCartridges = this.trader().virtualCartridges;
  var uiCartridges = buildUiCartridges(cartridges, virtualCartridges);
  var localeInfo = this.localeInfo;
  this.uiCartridges = uiCartridges;

  if (!this.billDispenser) {
    this.billDispenser = this.rootConfig.mockBillDispenser ?
      require('./mocks/billdispenser').factory() :
      require('./billdispenser').factory(this.rootConfig.billDispenser);
  }

  if (!this.billDispenser.initialized) this._transitionState('booting');
  if (this.billDispenser.initializing) return;

  this.billDispenser.init({
    cartridges: this.trader().cartridges,
    currency: this.trader().locale.currency
  }, function() {
    self._transitionState(State.DUAL_IDLE,
      {localeInfo: localeInfo, cartridges: uiCartridges});
  });
};

Brain.prototype._idleOneWay = function _idleOneWay() {
  this._transitionState(State.IDLE, {localeInfo: this.localeInfo});
};

Brain.prototype._balanceLow = function _balanceLow() {
  var self = this;

  function timeoutHandler() {
    self._idle();
  }

  function timeout() {
    self._screenTimeout(timeoutHandler, 10000);
  }

  this._transitionState('balanceLow');
  timeout();
};

Brain.prototype._start = function _start() {
  if (this.startDisabled) return;

  var fiatBalance = this.trader().balance;
  var highestBill = this.billValidator().highestBill(fiatBalance);

  if (!highestBill) return this._balanceLow();
  this._startAddressScan();
};

Brain.prototype._startIdScan = function _startIdScan() {
  var self = this;
  this._transitionState('scanId', {beep: true});
  var sessionId = this.trader().sessionId;
  this.idVerify.reset();
  this.billValidator().lightOn();
  this.scanner.scanPDF417(function (err, result) {
    self.getBillValidator().lightOff();
    clearTimeout(self.screenTimeout);
    self.scanner.camOff(function() { self.startDisabled = false; });

    if (err) throw err;
    var startState = _.contains(['scanId', 'fakeIdle', 'fakeDualIdle'], self.state);
    var freshState = self.trader().sessionId === sessionId && startState;
    if (!freshState) return;
    if (!result) return self._idle();
    self.idVerify.addLicense(result);
    self._verifyId({beep: true});
  });
  this.screenTimeout = setTimeout(function() {
    if (self.state !== 'scanId') return;
    self.scanner.cancel();
  }, this.config.qrTimeout);
};

Brain.prototype._cancelIdScan = function _cancelIdScan() {
  this.startDisabled = true;
  this._fakeIdle();
  this.scanner.cancel();
};

Brain.prototype._cancelIdCode = function _cancelIdCode() {
  this._idle();
};

function gcd(a, b) {
  if (b) return gcd(b, a % b);
  return Math.abs(a);
}

Brain.prototype._startAlternatingLight = function _startAlternatingLight() {
  var self = this;
  var lastState = 'on';
  var onInterval = this.config.scanLightOnInterval;
  var offInterval = this.config.scanLightOffInterval;
  var smallInterval = gcd(onInterval, offInterval);
  var onSkip = onInterval / smallInterval;
  var offSkip = offInterval / smallInterval;
  var count = 0;

  if (!onInterval) return;
  if (!offInterval) return this.billValidator().lightOn();

  this.billValidator().lightOn();
  this.alternatingLightTimer = setInterval(function() {
    count++;
    if (lastState === 'off') {
      if (count < offSkip) return;
      self.getBillValidator().lightOn();
      lastState = 'on';
    } else {
      if (count < onSkip) return;
      self.getBillValidator().lightOff();
      lastState = 'off';
    }
    count = 0;
  }, smallInterval);
};

Brain.prototype._stopAlternatingLight = function _stopAlternatingLight() {
  clearInterval(this.alternatingLightTimer);
  this.billValidator().lightOff();
};

Brain.prototype._startAddressScan = function _startAddressScan() {
  this._transitionState('scanAddress');
  var self = this;
  var sessionId = this.trader().sessionId;

  this._startAlternatingLight();
  this.scanner.camOn();
  this.scanner.scanMainQR(function(err, address) {
    self._stopAlternatingLight();
    clearTimeout(self.screenTimeout);

    // Only leave cam on if we're moving on to idVerify
    if (err || !address) self.scanner.camOff(function() {
      self.startDisabled = false;
    });

    if (err) self.emit('error', err);
    var startState = _.contains(['scanAddress', 'fakeIdle', 'fakeDualIdle'],
      self.state);
    var freshState = self.trader().sessionId === sessionId && startState;

    if (!freshState) return;
    if (!address) return self._idle();
    self._handleScan(address);
  });
  this.screenTimeout = setTimeout(function() {
    if (self.state !== 'scanAddress') return;
    self.scanner.cancel();
  }, this.config.qrTimeout);
};

Brain.prototype._verifyId = function _verifyId(options) {
  var beep = options && options.beep;
  this._transitionState('verifyingId', {beep: beep});
  var self = this;
  this.idVerify.verifyUser(function (err, result) {
    if (!err && result.success) return self._firstBill();

    // The rest of these screens require user input and need a timeout
    var nextState;
    if (err)
      nextState = 'idVerificationError';
    else if (result.errorCode === 'codeMismatch')
      nextState = 'idCodeFailed';
    else
      nextState = 'idVerificationFailed';

    self._transitionState(nextState);
    self._screenTimeout(self._restart.bind(self), self.config.confirmTimeout);
  });

};

Brain.prototype._idCode = function _idCode(code) {
  if (code === null) return this._restart();    // Timeout
  var paddedCode = String('0000' + code).slice(-4);  // Pad with zeros
  this.idVerify.addLicenseCode(paddedCode);
  this._verifyId();
};

Brain.prototype._fakeIdle = function _fakeIdle() {
  var idleState = this.trader().twoWayMode ? 'fakeDualIdle' : 'fakeIdle';
  this._transitionState(idleState);
};

Brain.prototype._cancelScan = function _cancelScan() {
  this.startDisabled = true;
  this._fakeIdle();
  this.scanner.cancel();
};

Brain.prototype._cancelInsertBill = function _cancelInsertBill() {
  this._idle();
  this.billValidator().disable();
};

Brain.prototype._exchangeRateRec = function _exchangeRateRec(rate) {
  if (!rate) return null;
  var fiatToXbt = truncateBitcoins(1 / rate);
  return {
    xbtToFiat: rate,
    fiatToXbt: fiatToXbt
  };
};

Brain.prototype._pollUpdate = function _pollUpdate() {
  var locale = this.trader().locale;
  this.currency = locale.currency;
  this.localeInfo = locale.localeInfo;
  var rec = {
    currency: this.currency,
    exchangeRate: this._exchangeRateRec(this.trader().exchangeRate),
    fiatExchangeRate: this.trader().fiatExchangeRate
  };
  if (_.contains(STATIC_STATES, this.state)) {
    rec.localeInfo = this.localeInfo;
  }
  this.browser().send(rec);
};

Brain.prototype._networkDown = function _networkDown() {
  this.networkDown = true;
  if (_.contains(BILL_ACCEPTING_STATES, this.state)) {
	this.billValidator().disable();
	this.browser().send({sendOnly: true});
    return;
  }
  if (!_.contains(STATIC_STATES, this.state)) return;
  this._forceNetworkDown();
};

Brain.prototype._forceNetworkDown = function _forceNetworkDown() {
  var self = this;
  if (!this.hasConnected && this.state != 'connecting') {
    this._transitionState('connecting');
    setTimeout(function () {
      self.hasConnected = true;
      if (self.state === 'connecting') self._idle();
    }, self.config.connectingTimeout);
    return;
  }

  if (this.hasConnected) this._transitionState(State.NETWORK_DOWN);
};

Brain.prototype._networkUp = function _networkUp() {
  // Don't go to start screen yet
  if (!this.billValidator().hasDenominations()) return;

  this.networkDown = false;
  if (_.contains([State.NETWORK_DOWN, 'connecting', 'wifiConnected'], this.state))
    this._restart();
};

Brain.prototype._transitionState = function _transitionState(state, auxData) {
  // TODO refactor code to use this
  // If we're in maintenance state, we stay there till we die
  if (this.state === state || this.state === 'maintenance') return;
  var rec = {action: state};
  if (auxData) _.merge(rec, auxData);
  this._setState(state);
  this.browser().send(rec);
};

Brain.prototype._bitcoinFractionalDigits =
    function _bitcoinFractionalDigits(amount) {
  var log = Math.floor(Math.log(amount) / Math.log(10));
  return (log > 0) ? 2 : 2 - log;
};

Brain.prototype._restart = function _restart() {
  console.assert(!this.billsPending, 'Shouldn\'t restart, bills are pending!');
  this._resetState();
  this.billValidator().disable();
  this._idle();
};

Brain.prototype._assertState = function _assertState(expected) {
  var actual = this.state;
  console.assert(actual === expected,
      'State should be ' + expected + ', is ' + actual);
};

Brain.prototype._handleScan = function _handleScan(address) {
  var self = this;
  this.bitcoinAddress = address;
  var checkId = this.trader().idVerificationEnabled;
  if (checkId) return this._startIdScan();
  this.scanner.camOff(function() { self.startDisabled = false; });
  this._firstBill();
};

Brain.prototype._firstBill = function _firstBill() {
  var address = this.bitcoinAddress;
  this.browser().send({action: 'scanned', buyerAddress: address});
  this._setState('acceptingFirstBill');
  this.billValidator().enable();
  this._screenTimeout(this._restart.bind(this), this.config.billTimeout);
  this._logTx({sessionId: this.trader().sessionId, bitcoinAddress: address},
      'scanAddress');
};

// Bill validating states

Brain.prototype._billInserted = function _billInserted() {
  this.browser().send({action: 'acceptingBill'});
  this._setState('billInserted');
};

Brain.prototype._billRead = function _billRead(data) {
  this._createPendingTransaction(data.denomination);

  var trader = this.trader();
  var billValidator = this.billValidator();
  var highestBill = null;
  var totalFiat = this.credit.fiat + this.pending.fiat;
  var returnState;

  // Trader balance is balance as of start of user session.
  // Reduce it by fiat we owe user.
  var fiatBalance = trader.balance - totalFiat;

  var txLimit = trader.txLimit;
  if (txLimit && totalFiat > txLimit) {
	billValidator.reject();
    this.pending = null;
    returnState = this.credit.fiat === 0 ?
        'acceptingFirstBill' : 'acceptingBills';
    this._setState(returnState, 'billInserted');

    // If we're here, there's a highestBill.
    // Otherwise, we'd be rejecting all bills and we'd be in sendOnly mode.
    highestBill = billValidator.highestBill(txLimit - this.credit.fiat);

    this.browser().send({
      action: 'highBill',
      highestBill: highestBill,
      reason: 'transactionLimit'
    });
    return;
  }

  if (fiatBalance >= 0) {
    billValidator.stack();
    highestBill = billValidator.highestBill(fiatBalance);
    var sendOnly = (highestBill === null);
    if (sendOnly) {
      billValidator.disable();
    }
    this.browser().send({
      action: 'acceptingBill',
      credit: this._uiCredit(),
      sendOnly: sendOnly
    });
    this._setState('billRead');
  } else {
    billValidator.reject();
    this.pending = null;
    returnState = this.credit.fiat === 0 ?
        'acceptingFirstBill' : 'acceptingBills';
    this._setState(returnState, 'billInserted');
    var newFiatBalance = trader.balance - this.credit.fiat;
    var newHighestBill = billValidator.highestBill(newFiatBalance);

    if (newHighestBill)
      this.browser().send({
        action: 'highBill',
        highestBill: newHighestBill,
        reason: 'lowBalance'
      });
    else {
      billValidator.disable();
      this.browser().send({credit: this._uiCredit(), sendOnly: true});
    }
  }
};

Brain.prototype._billValid = function _billValid() {
  this._setState('acceptingBills', 'billRead');
  var pending = this.pending;

  // No going back
  this.billsPending = true;

  // Update running total
  this.pending = null;
  this.credit.fiat += pending.fiat;
  this.credit.satoshis += pending.satoshis;
  this.credit.lastBill = pending.fiat;

  var self = this;

  // Puts in the trade to cover currency exchange risk
  // and replenish bitcoin reserves
  var tradeRec = _.clone(pending);
  tradeRec.currency = this.currency;  // TODO: This should be a per tx attribute
  tradeRec.uuid = uuid.v4(); // unique bill ID
  tradeRec.deviceTime = Date.now();
  tradeRec.toAddress = this.bitcoinAddress;
  tradeRec.partialTx = _.clone(this.credit);

  var trader = this.trader();
  trader.trade(tradeRec, function(err) {
    if (!err) {
      self.creditConfirmed.fiat += pending.fiat;
      self.creditConfirmed.satoshis += pending.satoshis;
    }
  });

  var txLimit = trader.txLimit;
  var billValidator = this.billValidator();
  if (txLimit !== null &&
      this.credit.fiat + billValidator.lowestBill() > txLimit) {
    billValidator.disable();
    this.browser().send({credit: this._uiCredit(), sendOnly: 'transactionLimit'});
  }

  this._screenTimeout(function() { self._sendBitcoins(); },
      this.config.billTimeout);

  if (this.sendOnValid) {
    this.sendOnValid = false;
    this._doSendBitcoins();
  }

  var rec = {
    bill: pending.fiat,
    currency: this.currency,
    bitcoins: satoshisToBitcoins(pending.satoshis),
    satoshis: truncateSatoshis(pending.satoshis),
  };
  this._logTx(rec, 'validateBill');
};

// TODO: clean this up
Brain.prototype._billRejected = function _billRejected() {
  this.browser().send({action: 'rejectedBill'});
  this.pending = null;
  var returnState = this.credit.fiat === 0 ?
      'acceptingFirstBill' : 'acceptingBills';
  this._setState(returnState);
  var credit = this._uiCredit();
  if (!credit.fiat || credit.fiat === 0) credit = null;
  var response = {
    action: 'rejectedBill',
    credit: credit
  };

  if (this.sendOnValid) {
    this.sendOnValid = false;
    if (credit !== null) {
      this._setState('acceptingBills');
      this._doSendBitcoins();
      this.browser().send({credit: credit});
      return;
    }
    response.action = 'acceptingFirstBill';
  }

  this.browser().send(response);
};

Brain.prototype._billStandby = function _billStandby() {
  if (this.state === 'acceptingBills' || this.state === 'acceptingFirstBill')
    this.billValidator().enable();
};

Brain.prototype._billJam = function _billJam() {
  // TODO FIX: special screen and state for this
  this.browser().send({action: State.NETWORK_DOWN});
};

Brain.prototype._billsEnabled = function _billsEnabled(data) {
  console.log('Bills enabled codes: 0x%s, 0x%s', data.data1.toString(16),
    data.data2.toString(16));
};

Brain.prototype._stackerOpen = function _stackerOpen() {
  this._logTx({currency: this.currency}, 'cashboxRemoved');
};

Brain.prototype._uiCredit = function _uiCredit() {
  var credit = this.credit;
  var fiat = credit.fiat;
  var satoshis = credit.satoshis;
  var lastBill = null;

  if (this.pending) {
    var pending = this.pending;
    fiat += pending.fiat;
    satoshis += pending.satoshis;
    lastBill = pending.fiat;
  } else {
    lastBill = credit.lastBill;
  }

  var bitcoins = satoshisToBitcoins(satoshis);
  return {
    fiat: fiat,
    bitcoins: bitcoins,
    lastBill: lastBill
  };
};

function satoshisToBitcoins(satoshis) {
  return truncateBitcoins(satoshis / SATOSHI_FACTOR);
}

Brain.prototype._createPendingTransaction =
    function _createPendingTransaction(bill) {
  console.assert(this.pending === null, 'pending is null, can\'t start tx');
  var exchangeRate = this.trader().exchangeRate;
  console.assert(exchangeRate, 'Exchange rate not set');
  var satoshiRate = SATOSHI_FACTOR / exchangeRate;
  var satoshis = truncateSatoshis(bill * satoshiRate);

  this.pending = {
    fiat: bill,
    exchangeRate: exchangeRate.toFixed(PRICE_PRECISION),
    satoshis: satoshis
  };
};

Brain.prototype._sendBitcoins = function _sendBitcoins() {
  this.browser().send({
    action: 'bitcoinTransferPending',
    buyerAddress: this.bitcoinAddress
  });

  if (this.state === 'acceptingBills') this._doSendBitcoins();
  else this.sendOnValid = true;
};

Brain.prototype._doSendBitcoins = function _doSendBitcoins() {
  this._setState('bitcoinsSent', 'acceptingBills');
  this.billValidator().disable();

  this.pending = null;

  this.lastTransaction = {
    address: this.bitcoinAddress,
    credit: this._uiCredit()
  };

  var self = this;
  var satoshis = truncateSatoshis(this.credit.satoshis);

  var rec = {
    bitcoins: satoshisToBitcoins(this.credit.satoshis),
    satoshis: satoshis,
    fiat: this.credit.fiat,
    currency: this.currency
  };
  this._logTx(rec, 'bitcoinsRequested');

  this._verifyTransaction();

  var tx = {
    toAddress: this.bitcoinAddress,
    satoshis: satoshis,
    currencyCode: this.currency,
    fiat: this.credit.fiat
  };
  this.trader().sendBitcoins(tx, function(err, transactionId) {
    var unconfirmedFiat = self.credit.fiat - self.creditConfirmed.fiat;
    if (err && unconfirmedFiat > 0) self._sendBitcoinsError(err);
    else self._cashInComplete(transactionId);
  });
};

// Giving up, go to special screens asking user to contact operator
Brain.prototype._sendBitcoinsError = function _sendBitcoinsError(err) {
  var rec = {
    error: err.message
  };
  this._logTx(rec, 'error');
  console.log('Error sending bitcoins: %s', err.message);

  var withdrawFailureRec = {
    credit: this._uiCredit(),
    sessionId: this.trader().sessionId
  };

  // Giving up
  this.billsPending = false;
  this._resetState();

  var self = this;
  if (err.status === 'InsufficientFunds') {
    setTimeout(function () { self._idle(); }, self.config.insufficientFundsTimeout);
    return this._transitionState('insufficientFunds');
  }

  this._transitionState('withdrawFailure', withdrawFailureRec);
  this._timeoutToIdle(60000);
};

function bitcoinFractionalDigits(amount) {
  var log = Math.floor(Math.log(amount) / Math.log(10));
  return (log > 0) ? 2 : 2 - log;
}

function truncateBitcoins(bitcoins) {
  var decimalDigits = bitcoinFractionalDigits(bitcoins);
  var adjuster = Math.pow(10, decimalDigits);
  return (Math.round(bitcoins * adjuster) / adjuster);
}

function truncateSatoshis(satoshis) {
  var bitcoins = satoshis / SATOSHI_FACTOR;
  var truncated = truncateBitcoins(bitcoins);
  return Math.round(truncated * SATOSHI_FACTOR);
}

// And... we're done!
Brain.prototype._cashInComplete =
    function _cashInComplete() {
  this._setState('completed');

  this.browser().send({
    action: 'bitcoinTransferComplete',
    sessionId: this.trader().sessionId
  });

  var rec = {
    bitcoins: satoshisToBitcoins(this.credit.satoshis),
    satoshis: truncateSatoshis(this.credit.satoshis),
    fiat: this.credit.fiat,
    currency: this.currency
  };
  this._logTx(rec, 'bitcoinsSent');

  this.billsPending = false;
  this._resetState();
  this._screenTimeout(this._completed.bind(this), this.config.completedTimeout);
};


Brain.prototype._verifyTransaction = function _verifyTransaction() {
  if (!this.idVerify.inProgress()) return;

  var transaction = {
    toAddress: this.bitcoinAddress,
    currencyCode: this.currency,
    fiat: this.credit.fiat,
    buyOrSell: 'buy'
  };
  this.idVerify.addTransaction(transaction);
  this.idVerify.verifyTransaction(function (err) { console.log(err); });
};

Brain.prototype._screenTimeoutHandler = function _screenTimeoutHandler(callback) {
  this.currentScreenTimeout = null;
  callback();
};

Brain.prototype._screenTimeout = function _screenTimeout(callback, timeout) {
  console.assert(!this.currentScreenTimeout,
      'Can\'t have two screen timeouts at once');
  var self = this;
  this.currentScreenTimeout =
      setTimeout(function() { self._screenTimeoutHandler(callback); }, timeout);
};

Brain.prototype._timeoutToIdle = function _timeoutToIdle(timeout) {
 var self = this;
 this._screenTimeout(function() { self._idle(); }, timeout);
};

Brain.prototype._completed = function _completed() {
  if (this.state === 'goodbye' || this.state === 'maintenance') return;
  if (this._isTestMode()) return this._testModeOff();

  this._transitionState('goodbye');

  this.trader().sessionId = null;

  var elapsed = Date.now() - this.bootTime;
  if (elapsed > this.config.exitTime) {
    console.log('Scheduled restart.');
    process.exit();
  }

  if (this.billValidatorErrorFlag) {
    this._transitionState('maintenance');
    this.emit('error', new Error('Bill validator error, exiting post transaction.'));
  }

  this._screenTimeout(this._restart.bind(this), this.config.goodbyeTimeout);
};

Brain.prototype._machine = function _machine() {
  this.browser().send({action: 'machine', machineInfo: this.config.unit});
  this._setState('machine');
};

Brain.prototype._cancelMachine = function _cancelMachine() {
  this._idle();
};

Brain.prototype._powerOffButton = function _powerOffButton() {
  var self = this;
  this.wifi.clearConfig(function () {
    self._powerOff();
  });
};

Brain.prototype._powerOff = function _powerOff() {
  this._setState('powerOff');
  console.log('powering off');
  cp.execFile('poweroff', ['-d', '2'], {}, function() {
    process.exit(0);
  });
};

Brain.prototype._fixTransaction = function _fixTransaction() {
  this._setState('fixTransaction');
  this.browser().send({
    action: 'fixTransaction',
    lastTransaction: this.lastTransaction
  });
};

Brain.prototype._abortTransaction = function _abortTransaction() {
  this.billsPending = false;
  this._restart();
};

Brain.prototype._resetState = function _resetState() {
  console.assert(!this.billsPending, 'Can\'t reset, bills are pending.');
  this.bitcoinAddress = null;
  this.credit.fiat = 0;
  this.credit.satoshis = 0;
  this.credit.lastBill = null;
  this.creditConfirmed.fiat = 0;
  this.creditConfirmed.satoshis = 0;
  this.pending = null;
};

Brain.prototype._setupCheckPower = function _setupCheckPower() {
  var self = this;
  setInterval(function() {
    self._checkPower();
  }, this.config.checkPowerTime);
};

// This can only get called when we're not in a transaction
Brain.prototype._checkPower = function _checkPower() {
  if (!_.contains(STATIC_STATES, this.state)) return;

  // TODO: factor this out to a device-specific module
  var powerStatusPath = this.config.powerStatus;
  if (!powerStatusPath) return;

  var self = this;
  fs.readFile(powerStatusPath, {encoding: 'utf8'}, function(err,  res) {
    if (err) return console.log(err.stack);
    if (res.match(/^Discharging/)) {
      console.log('Sensed power down.');
      var elapsed = Date.now() - self.lastPowerUp > self.config.checkPowerTimeout;
      if (!elapsed) return;
      console.log('Device unplugged. Powering down. Forgetting WiFi.');
      self._setState('powerDown');
      self.wifi.clearConfig(function () {
        self._powerOff();
        return;
      });
    }
    self.lastPowerUp = Date.now();
  });
};

Brain.prototype._logTx = function _logTx(rec, msg) {
  this.txLog.info(rec, msg);
};

Brain.prototype._billValidatorErr = function _billValidatorErr(err) {
  if (!err) err = new Error('Bill Validator error');

  if (this.billValidatorErrorFlag) return;  // Already being handled

  if (this.billsPending) {
    this.billValidatorErrorFlag = true;
    this.billValidator().disable(); // Just in case. If error, will get throttled.
    this.browser().send({credit: this._uiCredit(), sendOnly: true});
    return;
  }
  this._transitionState('maintenance');
  this.emit('error', err);
};

Brain.prototype._getFiatButtonResponse = function _getFiatButtonResponse() {
  var tx = this.fiatTx;
  var trader = this.trader();
  
  var cartridges = trader.cartridges;
  var virtualCartridges = trader.virtualCartridges;
  var txLimit = trader.fiatTxLimit;
  var activeDenominations =
    this.billDispenser.activeDenominations(txLimit, tx.fiat, cartridges,
    virtualCartridges);

  var response = {
    credit: tx,
    activeDenominations: activeDenominations
  };

  return response;
};

Brain.prototype._hasCash = function _hasCash() {
  return _.max(_.pluck(this.trader().cartridges, 'count')) > 0;
};

Brain.prototype._outOfCash = function _outOfCash() {
  var self = this;

  function timeoutHandler() {
    self._idle();
  }

  function timeout() {
    self._screenTimeout(timeoutHandler, 10000);
  }

  this._transitionState('outOfCash');
  timeout();
};

Brain.prototype._chooseFiat = function _chooseFiat() {
  if (!this._hasCash()) return this._outOfCash();
  var sessionId = this.trader().sessionId;
  this.fiatTx = {
    fiat: 0,
    satoshis: 0,
    currencyCode: this.currency,
    toAddress: null
  };
  var response = this._getFiatButtonResponse();
  this._transitionState('chooseFiat', {chooseFiat: response});
  var self = this;
  this.dirtyScreen = false;
  var interval = setInterval(function () {
    var doClear = self.state !== 'chooseFiat' ||
    self.trader().sessionId !== sessionId;
    if (doClear) return clearInterval(interval);

    var isDirty = self.dirtyScreen;
    self.dirtyScreen = false;
    if (isDirty) return;
    clearInterval(interval);
    self._idle();
  }, 120000);
};

Brain.prototype._chooseFiatCancel = function _chooseFiatCancel() {
  this._idle();
};

Brain.prototype._fiatButtonResponse = function _fiatButtonResponse() {
  this.dirtyScreen = true;
  var response = this._getFiatButtonResponse();
  this.browser().send({fiatCredit: response});
};

Brain.prototype._fiatButton = function _fiatButton(data) {
  var denomination = parseInt(data.denomination);
  var rate = this.trader().fiatExchangeRate;
  var tx = this.fiatTx;

  tx.fiat += denomination;
  tx.satoshis += truncateSatoshis((denomination / rate) * 1e8);

  this._fiatButtonResponse();
};

Brain.prototype._clearFiat = function _clearFiat() {
  var tx = this.fiatTx;

  tx.fiat = 0;
  tx.satoshis = 0;

  this._fiatButtonResponse();
};

Brain.prototype._cashOut = function _cashOut() {
  var self = this;
  var tx = this.fiatTx;

  function timeoutHandler() {
    self._transitionState('depositTimeout');
  }

  function timeout() {
    self._screenTimeout(timeoutHandler, 120000);
  }

  this._transitionState('deposit', {tx: tx});
  timeout();

  this.trader().cashOut(tx, function (err, bitcoinAddress) {
    if (err) self._idle();
    tx.toAddress = bitcoinAddress;
    self.browser().send({depositInfo: tx});
  });
};

function fullDispense(bills, fiat, cartridges) {
  var len = bills.length;
  var total = 0;

  for (var i = 0; i < len; i++) {
    total += bills[i].accepted * cartridges[i].denomination;
  }

  return total === fiat;
}

function fillInBills(tx, bills) {
  var len = bills.length;
  tx.billDistribution = [];
  for (var i = 0; i < len; i++) {
    tx.billDistribution[i] = {
      actualDispense: bills[i].accepted,
      rejected: bills[i].rejected
    };
  }
}

Brain.prototype._dispenseUpdate = function _dispenseUpdate(dispenseStatus) {
  if (this.state !== 'deposit' && this.state !== 'pendingDeposit') return;

  var self = this;

  function timeoutHandler() { self._idle(); }

  function timeout() {
    self._screenTimeout(timeoutHandler, 60000);
  }

  var status = dispenseStatus.status;
  switch(status) {
    case 'insufficientFunds':
      this._transitionState('insufficientDeposit');
      timeout();
      break;
    case 'rejected':
      this._transitionState('rejectedDeposit');
      timeout();
      break;
    case 'published':
      this._transitionState('pendingDeposit');
      break;
    case 'authorized':
    case 'confirmed':
      var fiat = dispenseStatus.fiat;
      var trader = self.trader();
      var cartridges = trader.cartridges;
      this.billDispenser.dispense(fiat, cartridges, function (err, result) {
        if (err) throw new Error(err);    // TODO special error screen

        var bills = result.bills;
        var tx = self.fiatTx;
        var cartridges = trader.cartridges;
        var wasFullDispense = fullDispense(bills, tx.fiat, cartridges);
        fillInBills(tx, bills);
        tx.error = result.err;
        trader.dispenseAck(tx);
        if (!wasFullDispense)
          return self._transitionState('outOfCash');

        var sessionId = trader.sessionId;
        setTimeout(function () {
          var doComplete = self.state === 'fiatComplete' &&
          trader.sessionId === sessionId;
          if (doComplete)
            self._completed();
        }, 60000);
        self._transitionState('fiatComplete', {tx: tx});
      });
      this._transitionState('dispensing');
      break;
  }
};

Brain.prototype.billValidator = function billValidator() {
	return this.billValidatorObj;
};

Brain.prototype.setBillValidator = function setBillValidator(obj) {
	this.billValidatorObj = obj;
};

Brain.prototype.browser = function browser() {
	return this.browserObj;
};

Brain.prototype.setBrowser = function setBrowser(obj) {
	this.browserObj = obj;
};

Brain.prototype.trader = function trader() {
	return this.traderObj;
};

Brain.prototype.setTrader = function setTrader(obj) {
	this.traderObj = obj;
};

Brain.prototype.pairing = function pairing() {
	return this.pairingObj;
};

Brain.prototype.setPairing = function setPairing(obj) {
	this.pairingObj = obj;
};

function startsWithUSB(file) {
  return file.indexOf('ttyUSB') === 0;
}

// This maps /sys style paths from USB hub positions to actual device paths
// Device paths are arbitrary, so we want to go by fixed hub positions, but
// node-serialport only takes device paths.
function determineDevicePath(path) {
  if (!path || path.indexOf('/sys/') !== 0) return path;
  try {
    var files = fs.readdirSync(path);
    var device = _.find(files, startsWithUSB);
    return device ? '/dev/' + device : null;
  } catch (e) {
    console.log('hub path not connected: ' + path);
    return null;
  }
}

module.exports = Brain;
