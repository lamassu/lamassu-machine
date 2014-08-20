'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Trader = function() {
  if (!(this instanceof Trader)) return new Trader();
  EventEmitter.call(this);

  this.exchangeRate = 123.45;
  this.balance = Math.pow(10, 8) * 100;
  this.txLimit = null;
  this.idVerificationLimit = null;
  this.idData = null;
  this.isMock = true;
  this.locale = {currency: 'USD', localeInfo: {
    primaryLocale: 'en-US',
    primaryLocales: ['en-US']
  }};
};
util.inherits(Trader, EventEmitter);

Trader.prototype.init = function init() {};

Trader.prototype.run = function run() {
  console.log('Using mock trader');
  var self = this;
  self.emit('pollUpdate');
  self.emit('networkUp');
  setInterval(function () {
    self.emit('pollUpdate');
    self.emit('networkUp');
  }, 3000);
};

Trader.prototype.trade = function trade() {};

Trader.prototype.sendBitcoins = function sendBitcoins(tx, cb) {
  cb(null, 'ed83b95940dbaecd845749d593a260819437838449f87b9257f25dfbd32f7fd6');
  this.emit('finishedTest');
};

Trader.prototype.resetId = function resetId() {
  this.idData = {};
};

Trader.prototype.verifyUser = function verifyUser(idRecord, cb) {
  console.log(util.inspect(idRecord, {depth: null, colors: true}));
  var response = {success: true};
  var err = null;

  if (idRecord.licenseCode === '1234')
    response = {success: false, errorCode: 'codeMismatch'};
  else if (idRecord.licenseCode === '1111')
    response = {success: false, errorCode: 'invalidIdentification'};
  else if (idRecord.licenseCode === '2222') {
    err = new Error("Server problem");
    response = {success: false, errorCode: 'serverError'};
  }

  setTimeout(function () {
    cb(err, response);
  }, 1300);
};

Trader.prototype.verifyTransaction = function verifyTransaction(idRecord) {
  console.log(util.inspect(idRecord, {depth: null, colors: true}));
  return;
};
module.exports = Trader;
