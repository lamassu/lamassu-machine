'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;
var minimist = require('minimist');

var commandLine = minimist(process.argv.slice(2));
var currency = commandLine.fiat || 'EUR';

var Trader = function() {
  if (!(this instanceof Trader)) return new Trader();
  EventEmitter.call(this);

  this.exchangeRate = 123.45;
  this.fiatExchangeRate = 125.45;
  this.fiatTxLimit = 100;
  this.balance = Math.pow(10, 8) * 100;
  this.txLimit = null;
  this.idVerificationLimit = null;
  this.idVerificationEnabled = false;
  this.idData = null;
  this.isMock = true;
  this.locale = {currency: currency, localeInfo: {
    primaryLocale: 'en-US',
    primaryLocales: ['en-US']
  }};
  this.twoWayMode = true;
  this.cartridges = [
    {denomination: 5, count: 220},
    {denomination: 20, count: 250}
  ];
  this.virtualCartridges = [10];
};
util.inherits(Trader, EventEmitter);

module.exports = Trader;

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
};

Trader.prototype.resetId = function resetId() {
  this.idData = {};
};

Trader.prototype.verifyUser = function verifyUser(idRecord, cb) {
  console.log(util.inspect(idRecord, {depth: null, colors: true}));
  var response = {success: true};
  var err = null;

  setTimeout(function () {
    cb(err, response);
  }, 1300);
};

Trader.prototype.verifyTransaction = function verifyTransaction(idRecord) {
  console.log(util.inspect(idRecord, {depth: null, colors: true}));
  return;
};

Trader.prototype.cashOut = function cashOut(tx, cb) {
  cb(null, '1xxxxxxx');
  var self = this;
  console.dir(tx);
  setTimeout(function() {
    self.emit('dispenseUpdate', {status: 'authorizedDeposit', dispenseFiat: tx.fiat});
  }, 1000);
};
