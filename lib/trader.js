'use strict';

var fs = require('fs');
var EventEmitter = require('events').EventEmitter;
var util = require('util');
var async = require('async');
var jsonquest = require('./jsonquest');

var _t0 = null;

var Trader = function(config) {
  if (!(this instanceof Trader)) return new Trader(config);
  EventEmitter.call(this);

  this.connectionInfo = null;
  this.protocol = config.protocol || 'https';
  this.rejectUnauthorized = typeof config.rejectUnauthorized === 'undefined' ?
    true :
    !!config.rejectUnauthorized;

  this.config = config;
  this.exchangeRate = null;
  this.balance = null;
  this.locale = null;

  this.exchange = null;
  this.balanceTimer = null;
  this.balanceRetries = 0;
  this.balanceTriggers = null;
  this.tickerExchange = null;
  this.transferExchange = null;
  this.pollTimer = null;
  this.pollRetries = 0;
  this.txLimit = null;
  this.idVerificationLimit = null;
  this.idVerificationEnabled = false;
};
util.inherits(Trader, EventEmitter);

Trader.prototype.init = function init(connectionInfo) {
  if (this.protocol === 'https') {
    this.cert = fs.readFileSync(this.config.certs.certFile);
    this.key = fs.readFileSync(this.config.certs.keyFile);
  }
  this.connectionInfo = connectionInfo;

  jsonquest.setEmitter(this.emit);
};

Trader.prototype.pair = function pair(connectionInfo) {
  this.connectionInfo = connectionInfo;
};

Trader.prototype._request = function _request(options, cb) {
  var protocol = this.protocol || 'https';
  var connectionInfo = this.connectionInfo;
  var self = this;

  jsonquest({
    protocol: protocol,
    host: connectionInfo.host,
    port: connectionInfo.port,
    cert: this.cert,
    key: this.key,
    rejectUnauthorized: this.rejectUnauthorized,
    method: options.method,
    path: options.path,
    body: options.body,
    repeatUntilSuccess: options.repeatUntilSuccess
  }, function (err, res, body) {
    if (err) return cb(_richError(err.message, 'networkDown'));

    if (protocol === 'https') {
      var fingerprint = res.socket.getPeerCertificate().fingerprint;
      if (fingerprint !== connectionInfo.fingerprint)
        return cb(_richError('Security Error: Unauthorized server certificate!'));
    }

    if (res.statusCode === 404) {
      self.connectionInfo = null;
      return cb(_richError('Server has unpaired', 'unpair'));
    }

    // All 2xx codes are OK
    if (res.statusCode < 200 || res.statusCode >= 300)
      return cb(_richError('Server returned ' + res.statusCode + ': ' + body.err));

    var errRec = body.err ? {name: body.errType, message: body.err} : null;
    var result = body;

    if (errRec) return cb(_richError(errRec.message, errRec.name));
    cb(null, result);
  });
};

Trader.prototype.run = function run() {
  var self = this;

  self.trigger();
  self.triggerInterval = setInterval(function() {
    self.trigger();
  }, this.config.settings.pollInterval);
};

Trader.prototype.stop = function stop() {
  if (this.triggerInterval) clearInterval(this.triggerInterval);
};

Trader.prototype.verifyUser = function verifyUser(idRec, cb) {
  console.log(idRec);
  this._request({
    path: '/verify_user',
    method: 'POST',
    body: idRec
  }, cb);
};

Trader.prototype.verifyTransaction = function verifyTransaction(idRec) {
  console.log(idRec);
  this._request({
    path: '/verify_transaction',
    method: 'POST',
    body: idRec
  }, function(err) {
    if (err) console.log(err);
  });
};

Trader.prototype.reportEvent = function reportEvent(eventType, note) {
  var rec = {
    eventType: eventType,
    note: note,
    deviceTime: Date.now()
  };
  this._request({
    path: '/event',
    method: 'POST',
    body: rec,
    repeatUntilSuccess: true
  }, function (err) {
    if (err) console.log(err);
  });
};

Trader.prototype.sendBitcoins = function sendBitcoins(tx, cb) {
  this._request({
    path: '/send',
    method: 'POST',
    body: tx,
    repeatUntilSuccess: true
  }, function (err, result) {
    if (!err) cb(null, result.txId);
    else {
      if (err.name === 'InsufficientFunds') return cb(err);
      if (err.name === 'networkDown') return cb(new Error('sendBitcoins timeout'));
    }
  });
};

Trader.prototype.trigger = function trigger() {
  var self = this;

  // Not paired yet
  if (this.connectionInfo === null) return;

  self._request({
    path: '/poll',
    method: 'GET'
  }, function (err, res) {
    self._pollHandler(err, res);
  });
};

// TODO: Keep trying, like sendBitcoins
Trader.prototype.trade = function trade(rec, cb) {
  this._request({
    path: '/trade',
    method: 'POST',
    body: rec,
    repeatUntilSuccess: true
  }, cb);
};

// Private functions

Trader.prototype._pollHandler = function _pollHandler(err, res) {
  if (err && err.name === 'networkDown') {
    if (_t0 === null) {
      _t0 = Date.now();
      return;
    }

    if (Date.now() - _t0 > this.config.settings.pollTimeout) {
      _t0 = null;
      this.emit('networkDown');
      return;
    }
  }

  if (err && err.name === 'unpair') {
    this.emit('unpair');
    return;
  }

  _t0 = null;

  // Not a network error, so no need to keep trying
  if (err) {
    this.emit('networkDown');
    return;
  }

  this.txLimit = res.txLimit;
  this.idVerificationLimit = res.idVerificationLimit;
  this.idVerificationEnabled = res.idVerificationEnabled;
  this.exchangeRate = res.rate;
  this.balance = res.fiat;
  this.locale = res.locale;
  this.emit('pollUpdate');
  this.emit('networkUp');
};

function _richError(errMessage, name) {
  var err = new Error(errMessage);
  err.name = name;
  return err;
}

module.exports = Trader;
