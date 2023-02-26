#!/usr/bin/env node

const fs = require('fs-extra')
const path = require('path')
var rimraf = require("rimraf");

const base = process.argv[2]
const mode = process.argv[3]

const isNative = m => {
  const isNative = fs.existsSync(path.resolve(base, m, 'build', 'Release'))

  // TODO this is awfully manual right now. 
  const mappedNative = m === '@lamassu' || m === '@pokusew' || m === '@joepie91' || m === 'keccak' || m === '@serialport'

  if (mode === '--rem-native')
    return isNative || mappedNative
  return ! (isNative || mappedNative)
}

fs.readdirSync(base)
  .filter(isNative)
  .forEach(it => rimraf.sync(path.resolve(path.join(base, it))))
