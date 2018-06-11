'use strict'

var argv = require('minimist')(process.argv.slice(2))
var _ = require('lodash')

var billDispenser

var denominations = _.map(argv._.slice(0, 2),
  function (item) { return parseInt(item, 10) })
var currency = argv.c || 'EUR'
var device = argv.d || '/dev/ttyUSB0'

if (denominations.length !== 2) {
  console.log('dispense [-c EUR] 5 10\n' +
  'Where 5 is the top denomination and 10 is the bottom denomination.')
  process.exit(1)
}

var cartridges = [
  {denomination: denominations[0], count: 220},
  {denomination: denominations[1], count: 250}
]

var data = {cartridges: cartridges, currency: currency}

billDispenser = require('../lib/billdispenser').factory({device: device})
billDispenser.init(data)
  .then(() => {
    console.log('Success.')
    process.exit(0)
  })
  .catch(err => {
    console.log(err)
    process.exit(1)
  })
