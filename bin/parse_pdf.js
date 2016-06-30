'use strict'

var fs = require('fs')
var util = require('util')
var parser = require('../lib/compliance/parsepdf417')

// var licensePath = 'mock_data/compliance/fl.dat'
var licensePath = 'mock_data/compliance/ny.dat'
// var licensePath = 'scratch/nc2.dat'
var data = fs.readFileSync(licensePath, 'utf8')
data = data.replace('&', '\r')
console.log(data)
var result = parser.parse(data)
console.log(util.inspect(result, {depth: null, colors: true}))
