var pkg = require('../package.json')
var native = require('./native.json')
var R = require('ramda')

var deps = Object.getOwnPropertyNames(pkg.dependencies)
var nonNative = R.difference(deps, native)
console.log(nonNative.join('\n'))

/*
var fs = require('fs')
var existing = fs.readFileSync('./existing.txt', 'utf8').split('\n')
console.log(R.difference(existing, deps))
*/
