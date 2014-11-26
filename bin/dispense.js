'use strict';

var argv = require('minimist')(process.argv.slice(2));
var _ = require('lodash');

var billDispenser = require('../lib/billDispenser').
  factory({device: '/dev/ttyS1'});

var denominations = _.map(argv._.slice(0, 2),
  function(item) { return parseInt(item, 10); });
var currency = argv.c || 'EUR';

if (denominations.length !== 2) {
  console.log('dispense [-c EUR] 5 10\n' +
    'Where 5 is the top denomination and 10 is the bottom denomination.');
  process.exit(1);
}

var dispenseAmount = denominations[0] + denominations[1];

billDispenser.init({
  cartridges: [
    {denomination: denominations[0], count: 220},
    {denomination: denominations[1], count: 250}
  ],
  virtualCartridges: [],
  currency: currency
}, function() {
  billDispenser.dispense(dispenseAmount, function (err, result) {
    if (err) throw err;
    console.dir(result.bills);
  });
});


