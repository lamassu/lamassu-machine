'use strict'

var PuloonRs232 = require('../lib/puloon/puloonrs232')

// var serialDevice = '/dev/ttyS0'
var serialDevice = '/dev/tty.NoZAP-PL2303-00005114'
var puloonRs232 = PuloonRs232.factory(serialDevice)

puloonRs232.open(function () {
  puloonRs232._setBillLengths(function (err) {
    if (err) return console.dir(err)
    console.log('done')
  })
})
