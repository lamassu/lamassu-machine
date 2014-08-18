'use strict';

var BillDispenser = function() {
  this.cartridges = [
    {denomination: 5, count: 500},
    {denomination: 20, count: 500}
  ];
  this.virtualCartridges = [10];
};

BillDispenser.factory = function factory(config) {
  var billDispenser = new BillDispenser(config);
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
  console.log('MOCK reset');
};

BillDispenser.prototype.dispense = function dispense(fiat, cb) {
  console.log('DEBUG dispensing: %d', fiat);
  var distribution = this.billDistribution(fiat);
  console.dir(distribution);
  setTimeout(function () {
    cb(null, null);
  }, 1000);
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
