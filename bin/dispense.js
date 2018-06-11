'use strict'

var argv = require('minimist')(process.argv.slice(2))
var _ = require('lodash')

const leds = require('../lib/leds/leds')

var billDispenser

var notes = _.map(argv._.slice(0, 2),
  function (item) { return parseInt(item, 10) })

var device = argv.d || '/dev/ttyUSB0'

if (notes.length !== 2) {
  console.log('dispense [-c EUR] 5 10\n' +
  'Where 5 is the top count and 10 is the bottom count.')
  process.exit(1)
}

leds.flashValidator()
billDispenser = require('../lib/billdispenser').factory({device: device})
billDispenser.open()
  .then(
    () => billDispenser.dispense(notes),
    err => {
      console.log(err)
      process.exit(1)
    })
  .then(
    result => {
      leds.off()
      console.dir(result.bills)
      setTimeout(() => process.exit(0), 500)
    })
  .catch(err => {
    console.log(err)
    process.exit(2)
  })
