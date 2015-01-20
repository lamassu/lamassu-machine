'use strict';

var deviceDriver = require('./puloon/puloonrs232');

var BillDispenser = function(config) {
  this.device = deviceDriver.factory(config.device);
  this.device.on('response', function (res) {
    console.log('INFO dispenser response');
    console.dir(res);
  });
  this.initialized = false;
  this.initializing = false;
};

BillDispenser.factory = function factory(config) {
  var billDispenser = new BillDispenser(config);
  return billDispenser;
};

module.exports = BillDispenser;

BillDispenser.prototype._setup = function _setup(data) {
  this.currency = data.currency;
};

BillDispenser.prototype.init = function init(data, cb) {
  var self = this;

  if (this.initializing || this.initialized) return cb();
  this.initializing = true;

  this._setup(data);
  this.device.open(function() {
    self.reset(data.cartridges, function() {
      self.initialized = true;
      self.initializing = false;
      cb();
    });
  });
};

// Assumes cartridges are sorted in ascending order of denomination.
// The result is another "cartridges" array, and can be fed back in.
function billDistribution(credit, cartridges) {
  var lastIndex = cartridges.length - 1;
  var distribution = [];
  for (var i = lastIndex; i >= 0; i--) {
    var cartridge = cartridges[i];
    var denomination = cartridge.denomination;
    var maxCount = Math.floor(credit / denomination);
    var dispenseCount = Math.min(maxCount, cartridge.count);
    var remaining = cartridge.count - dispenseCount;
    distribution.unshift({
      denomination: denomination,
      count: remaining,
      dispense: dispenseCount});
    credit -= dispenseCount * denomination;
  }

  if (credit !== 0) return null;
  return distribution;
}

BillDispenser.prototype.reset = function reset(cartridges, cb) {
  var device = this.device;
  var self = this;
  device.reset(cartridges, self.currency, function(err) {
    if (err)
      console.log('Serialport error: ' + err.message);
    cb(err);
  });
};

BillDispenser.prototype.dispense = function dispense(fiat, cartridges, cb) {
  var distribution = billDistribution(fiat, cartridges);
  var notes = [distribution[0].dispense, distribution[1].dispense];
  var device = this.device;
  device.dispense(notes, function (err, res) {

    // Need to check error more carefully to see which, if any,
    // bills were dispensed.
    if (err) return cb(err);

    cb(null, res);
  });
};

BillDispenser.prototype.activeDenominations =
    function activeDenominations(limit, fiatCredit, cartridges,
    virtualCartridges) {
  var distribution = billDistribution(fiatCredit, cartridges);
  if (distribution === null) return null;

  var activeMap = {};
  var remainingLimit = limit - fiatCredit;
  var isEmpty = true;
  var txLimitReached = true;
  distribution.forEach(function (data) {
    var denomination = data.denomination;
    if (data.count > 0) isEmpty = false;
    if (denomination <= remainingLimit) txLimitReached = false;
    activeMap[denomination] = data.count > 0 && denomination <= remainingLimit;
  });

  virtualCartridges.forEach(function (denomination) {
    if (denomination > remainingLimit) {
      activeMap[denomination] = false;
      return;
    }
    var testDistribution = billDistribution(denomination, distribution);
    activeMap[denomination] = (testDistribution !== null);
  });

  return {
    activeMap: activeMap,
    isEmpty: isEmpty,
    txLimitReached: txLimitReached
  };
};
