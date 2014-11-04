'use strict';

var deviceDriver = require('./puloon/puloonrs232');

var BillDispenser = function(config) {
  this.device = deviceDriver.factory(config.device);
  this.device.on('response', function (res) {
    console.log('DEBUG dispenser response');
    console.dir(res);
  });
  this.cartridges = [
    {denomination: 5, count: 220},
    {denomination: 20, count: 250}
  ];
  this.virtualCartridges = [10];
  this.currency = config.currency;
};

BillDispenser.factory = function factory(config) {
  var billDispenser = new BillDispenser(config);
  billDispenser.reset();
  return billDispenser;
};

module.exports = BillDispenser;

// Assumes cartridges are sorted in ascending order of denomination.
// The result is another "cartridges" array, and can be fed back in.
function computeBillDistribution(credit, cartridges) {
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

BillDispenser.prototype.billDistribution = function billDistribution(fiat) {
  return computeBillDistribution(fiat, this.cartridges);
};

BillDispenser.prototype.reset = function reset() {
  var device = this.device;
  var self = this;
  device.open(function (done) {
    device.reset(self.cartridges, self.currency, done);
  });
};

BillDispenser.prototype.dispense = function dispense(fiat, cb) {
  var distribution = this.billDistribution(fiat);
  console.dir(distribution);
  var notes = [distribution[0].dispense, distribution[1].dispense];
  var device = this.device;
  var self = this;
  device.open(function (done) {
    device.dispense(notes, function (err, res) {
      done();

      // Need to check error more carefully to see which, if any,
      // bills were dispensed.
      if (err) return cb(err);

      // TODO base this on actual notes dispensed, generalize
      // Should be handled by remote server
      self.cartridges[0].count -= distribution[0].dispense;
      self.cartridges[1].count -= distribution[1].dispense;

      cb(null, res);
    });
  });
};

BillDispenser.prototype.activeDenominations = function activeDenominations(limit, fiatCredit) {
  var billDistribution = this.billDistribution(fiatCredit);
  if (billDistribution === null) return null;

  var activeMap = {};
  var remainingLimit = limit - fiatCredit;
  var isEmpty = true;
  billDistribution.forEach(function (data) {
    var denomination = data.denomination;
    if (data.count > 0) isEmpty = false;
    activeMap[denomination] = data.count > 0 && denomination <= remainingLimit;
  });

  console.dir(billDistribution);

  this.virtualCartridges.forEach(function (denomination) {
    if (denomination > remainingLimit) {
      activeMap[denomination] = false;
      return;
    }
    var testDistribution = computeBillDistribution(denomination, billDistribution);
    activeMap[denomination] = testDistribution !== null;
  });

  return {activeMap: activeMap, isEmpty: isEmpty};
};
