#!/usr/bin/env node

const fs = require('fs-extra')
const path = require('path')
const _ = require('lodash/fp')

const pkg = require('../package.json')

const deps = _.keys(pkg.dependencies)

const srcBase = process.argv[2]
const destBase = process.argv[3]

const isNative = m => fs.existsSync(path.resolve(srcBase, m, 'build', 'Release'))

deps.forEach(m => {
  if (isNative(m)) return
  const src = path.resolve(path.join(srcBase, m))
  const dest = path.resolve(path.join(destBase, m))
  fs.copySync(src, dest)
})
