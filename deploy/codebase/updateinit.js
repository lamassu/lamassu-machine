'use strict';

const fs = require('fs');
const zlib = require('zlib');
const async = require('./async');
const cp = require('child_process');
const report = require('./report').report;

const hardwareCode = process.argv[2];
const tar = hardwareCode === 'aaeon' ? 
  require('/opt/apps/machine/lamassu-machine/node_modules/tar') :
  require('/opt/lamassu-machine/node_modules/tar');

const TIMEOUT = 120000;

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
    const currentDeviceConfigPath = hardwareCode === 'aaeon' ? 
      '/opt/apps/machine/lamassu-machine/device_config.json' :
      '/opt/lamassu-machine/device_config.json'

    const newDeviceConfigPath = `/tmp/extract/package/subpackage/hardware/${hardwareCode}/device_config.json`
    
    // Updates don't necessarily need to carry a device_config.json file
    if (!fs.existsSync(newDeviceConfigPath)) return cb()
    
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
applicationParentFolder = '/opt'
if (hardwareCode === 'aaeon')
  applicationParentFolder = '/opt/apps/machine'

async.series([
  async.apply(command, 'mkdir -p /opt/apps/machine'),
  async.apply(untar, '/tmp/extract/package/subpackage.tgz', '/tmp/extract/package/'),
  async.apply(command, `cp -PR /tmp/extract/package/subpackage/lamassu-machine ${applicationParentFolder}`),
  async.apply(command, `cp -PR /tmp/extract/package/subpackage/hardware/${hardwareCode}/node_modules ${applicationParentFolder}/lamassu-machine/`),
  async.apply(installDeviceConfig),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
