#!/usr/bin/env node

/*

Use ``npm install --global-style`` on a target device to build all node_modules.

Then use this script to package native_modules.tgz and
decompress to hardware/codebase/<device>

*/

const fs = require('fs')
const cp = require('child_process')

const mm = fs.readdirSync('./node_modules')

const pathList = mm
.filter(m => {
  const nativePath = `./node_modules/${m}/build/Release`
  return fs.existsSync(nativePath)
})
.map(m => `./node_modules/${m}`)

if (pathList.length === 0) {
  console.log('No native modules')
  process.exit(1)
}

const cmd = `tar -czf native_modules.tgz ${pathList.join(' ')}`

try {
  cp.execSync(cmd)
  console.log('Successfully built native_modules.tgz.')
  process.exit(0)
} catch (err) {
  console.log(err)
  process.exit(2)
}
