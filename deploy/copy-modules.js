#!/usr/local/bin/node

var fs = require('fs-extra')
var path = require('path')
var R = require('ramda')

var pkg = require('../package.json')
var native = require('./native.json')

var deps = Object.getOwnPropertyNames(pkg.dependencies)
var nonNative = R.difference(deps, native)

var srcBase = process.argv[2]
var destBase = process.argv[3]

nonNative.forEach(function (m) {
  var src = path.resolve(path.join(srcBase, m))
  var dest = path.resolve(path.join(destBase, m))
  fs.copySync(src, dest)
})
