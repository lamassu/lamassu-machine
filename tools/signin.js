'use strict'

const fs = require('fs')

const volume = 'SSUTRAN'
const packageName = process.argv[3] || 'codebase'
const path = `/Volumes/${volume}/sign/update.${packageName}.sig`
const outPath = `./build/${packageName}/info.json`


const version = process.argv[2]

if (!version) {
  console.log('Usage: signin <version> [<packageName>]')
  process.exit(1)
}

const regex = /([0-9a-f]+)$/
const fileContents = fs.readFileSync(path, 'utf8').trim()
const contentSig = fileContents.match(regex)[0]
const timestamp = new Date().toISOString()

const rec = {
  version,
  contentSig,
  timestamp,
  dependencies: [],
  requiredVersion: null
}

try {
  fs.mkdirSync(outPath)
} catch (err) {
  // No-op
}

console.log(JSON.stringify(rec))
// fs.writeFileSync(outPath, JSON.stringify(rec))

console.log('Success.')
console.log(rec)
