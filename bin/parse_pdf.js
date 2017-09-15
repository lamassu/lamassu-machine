'use strict'

var fs = require('fs')
var path = require('path')
var util = require('util')
var parser = require('../lib/compliance/parsepdf417')

var licensePath = process.argv[2]
console.log(path.resolve(__dirname, '..', licensePath))

var data = fs.readFileSync(licensePath, 'utf8')
var result = parser.parse(data)
console.log(util.inspect(result, {depth: null, colors: true}))
