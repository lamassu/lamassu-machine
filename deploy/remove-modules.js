#!/usr/bin/env node

const fs = require('fs')
const path = require('path')
var rimraf = require("rimraf");

const base = process.argv[2]
const mode = process.argv[3]

const isNative = m => {
  const isNative = fs.existsSync(path.resolve(base, m, 'build', 'Release'))

  // TODO this is awfully manual right now. 
  const mappedNative = m === 'keccak' || m === '@serialport' || m === '@lamassu'

  if (mode === '--rem-native')
    return isNative || mappedNative
  return ! (isNative || mappedNative)
}

fs.readdirSync(base)
  .filter(isNative)
  .forEach(it => rimraf.sync(path.resolve(path.join(base, it))))
