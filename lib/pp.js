'use strict'

var util = require('util')

module.exports = pp

function pp (label) {
  return function (o) {
    console.log(label)
    console.log(util.inspect(o, {depth: null, colors: true}))
  }
}
