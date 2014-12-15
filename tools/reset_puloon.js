var async = require('async');

var config = {
  device: '/dev/ttyS1'
};
var billDispenser = require('../lib/billdispenser').factory(config);
var device = billDispenser.device;
device.on('error', console.log);
device.on('close', console.log);
device.on('connected', console.log);

var cartridges = [
    {denomination: 50, count: 100},
    {denomination: 100, count: 0}
  ];

var virtualCartridges = [100];
var currency = 'USD';
var data = {
    cartridges: cartridges,
    virtualCartridges: virtualCartridges,
    currency: currency
  };

/*
init(function() {
  console.log('DEBUG dispense closure');
  billDispenser.dispense(6, function() {console.log('DONE'); });
});
*/

function initializeDevice(cb) {
  device.open(function (done) {
    device._getSerialNumber(function (err, serialNumber) {
      device.serialNumber = serialNumber;
      console.log('DEBUG serialNumber: %d', device.serialNumber);
      device._setBillLengths(cartridges, currency, function() {
        done();
        cb();
      });
    });
  });
}

billDispenser._setup(data);
initializeDevice(function() {
  billDispenser.dispense(200, function() {console.log('DONE'); });
});

/*
async.series([
  async.apply(init),
  function(cb) { console.log('DEBUG dispense closure'); billDispenser.dispense(6, cb); }
]);
*/
