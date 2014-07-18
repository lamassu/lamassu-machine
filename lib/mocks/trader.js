'use strict';

var util = require('util');
var EventEmitter = require('events').EventEmitter;

var Trader = function() {
  if (!(this instanceof Trader)) return new Trader();
  EventEmitter.call(this);

  this.exchangeRate = 123.45;
  this.balance = Math.pow(10, 8) * 100;
  this.txLimit = null;
  this.idVerificationLimit = 0;
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

Trader.prototype.verifyId = function verifyId(idRecord, cb) {
  console.log(util.inspect(idRecord, {depth: null, colors: true}));

  setTimeout(function () {
    cb(null, {success: true});
  }, 700);
};

module.exports = Trader;
