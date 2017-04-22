'use strict'

var fs = require('fs-extra')
var zlib = require('zlib')
var async = require('./async')
var cp = require('child_process')
var report = require('./report').report

var TIMEOUT = 10000

var hardwareCode = process.argv[2] || 'N7G1'

function command (cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function (err) {
    cb(err)
  })
}

function remountRW (cb) {
  if (hardwareCode !== 'N7G1') return cb()
  command('/bin/mount -o remount,rw /', cb)
}

function unzip (zipped, outPath, cb) {
  var fileIn = fs.createReadStream(zipped)
  var fileOut = fs.createWriteStream(outPath, {mode: '0755'})
  var gunzip = zlib.createGunzip()

  fileIn.pipe(gunzip).pipe(fileOut)
    .on('error', cb)
    .on('finish', cb) // success
}

function copyNode (cb) {
  fs.move('/usr/bin/node', '/usr/bin/node-old', {overwrite: true}, function (err) {
    if (err) return cb(err)
    fs.copy('/tmp/extract/package/node', '/usr/bin/node', function (err2) {
      if (err2) return cb(err2)
      cb()
    })
  })
}

async.series([
  async.apply(remountRW),
  async.apply(unzip, '/tmp/extract/package/node.gz', '/tmp/extract/package/node'),
  async.apply(copyNode),
  async.apply(report, null, 'finished.')
], function (err) {
  if (err) throw err
})
