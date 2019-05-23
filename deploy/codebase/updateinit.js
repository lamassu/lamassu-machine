'use strict';

var fs = require('fs');
var zlib = require('zlib');
var async = require('./async');
var cp = require('child_process');
var report = require('./report').report;
var tar = require('/opt/apps/machine/lamassu-machine/node_modules/tar');

var TIMEOUT = 120000;

var hardwareCode = process.argv[2];

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function untar(tarball, outPath, cb) {
  var fileIn = fs.createReadStream(tarball);
  fileIn.pipe(zlib.createGunzip()).pipe(tar.Extract(outPath))
  .on('error', cb)
  .on('end', cb);   // success
}

function installDeviceConfig (cb) {
  try {
    const currentDeviceConfigPath = '/opt/apps/machine/lamassu-machine'
    const newDeviceConfigPath = `/tmp/extract/package/subpackage/lamassu_machine/device_config_${hardwareCode}.json`
    const currentDeviceConfig = require(currentDeviceConfigPath)
    const newDeviceConfig = require(newDeviceConfigPath)

    if (currentDeviceConfig.billDispenser) {
      newDeviceConfig.billDispenser.mode = currentDeviceConfig.billDispenser.model
      newDeviceConfig.billDispenser.device = currentDeviceConfig.billDispenser.device
    }
    if (currentDeviceConfig.billValidator) {
      newDeviceConfig.billValidator.rs232.device = currentDeviceConfig.billValidator.rs232.device
    }

    // Pretty-printing the new configuration to retain its usual form.
    const adjustedDeviceConfig = JSON.stringify(newDeviceConfig, null, 2)
    fs.writeFileSync(currentDeviceConfigPath, adjustedDeviceConfig)

    cb()
  }
  catch (err) {
    cb(err)
  }
}

let applicationParentFolder = null
if (hardwareCode === 'aaeon')
  applicationParentFolder = '/opt/apps/machine'
applicationParentFolder = '/opt'

async.series([
  async.apply(command, 'mkdir -p /opt/apps/machine'),
  async.apply(untar, '/tmp/extract/package/subpackage.tgz', '/tmp/extract/package/'),
  async.apply(command, `cp -a /tmp/extract/package/subpackage/lamassu-machine ${applicationParentFolder}`),
  async.apply(command, `cp -a /tmp/extract/package/subpackage/hardware/${hardwareCode}/node_modules ${applicationParentFolder}/lamassu-machine/node_modules`),
  async.apply(installDeviceConfig),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
