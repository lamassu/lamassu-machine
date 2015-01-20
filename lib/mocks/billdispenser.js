'use strict';

var BillDispenser = function() {
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
  setTimeout(function() {
    self.initialized = true;
    self.initializing = false;
    cb();
  }, 1000);
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

BillDispenser.prototype.dispense = function dispense(fiat, cartridges, cb) {
  console.log('INFO dispensing: %d', fiat);
  var distribution = billDistribution(fiat, cartridges);
  console.dir(cartridges);
  console.dir(distribution);
  setTimeout(function () {
    var result = {
      bills: [
        {accepted: distribution[0].dispense, rejected: 1},
        {accepted: distribution[1].dispense, rejected: 0}
      ]
    };
    cb(null, result);
  }, 1000);
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
