#!/usr/local/bin/node

var fs = require('fs-extra')
var path = require('path')

var pkg = require('../package.json')

var deps = Object.getOwnPropertyNames(pkg.dependencies)

var srcBase = process.argv[2]
var destBase = process.argv[3]

const isNative = m => fs.existsSync(path.resolve(srcBase, m, 'build', 'Release'))

deps.forEach(m => {
  if (isNative(m)) return
  var src = path.resolve(path.join(srcBase, m))
  var dest = path.resolve(path.join(destBase, m))
  fs.copySync(src, dest)
})
