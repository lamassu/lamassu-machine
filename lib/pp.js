'use strict'

var util = require('util')

module.exports = function pp (obj) {
  console.log(util.inspect(obj, {depth: null, colors: true}))
}
