'use strict';

const fs = require('fs');
const async = require('./async');
const cp = require('child_process');
const report = require('./report').report;

const hardwareCode = process.argv[2];
const TIMEOUT = 600000;
const applicationParentFolder = hardwareCode === 'aaeon' ? '/opt/apps/machine' : '/opt'

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function installDeviceConfig (cb) {
  try {
    const currentDeviceConfigPath = `${applicationParentFolder}/lamassu-machine/device_config.json`
    const newDeviceConfigPath = `/tmp/extract/package/subpackage/hardware/${hardwareCode}/device_config.json`
    
    // Updates don't necessarily need to carry a device_config.json file
    if (!fs.existsSync(newDeviceConfigPath)) return cb()
    
    const currentDeviceConfig = require(currentDeviceConfigPath)
    const newDeviceConfig = require(newDeviceConfigPath)

    if (currentDeviceConfig.billDispenser) {
      newDeviceConfig.billDispenser.model = currentDeviceConfig.billDispenser.model
      newDeviceConfig.billDispenser.device = currentDeviceConfig.billDispenser.device
    }
    if (currentDeviceConfig.billValidator) {
      newDeviceConfig.billValidator.deviceType = currentDeviceConfig.billValidator.deviceType
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

async.series([
  async.apply(command, 'tar zxf /tmp/extract/package/subpackage.tgz -C /tmp/extract/package/'),
  async.apply(command, `cp -PR /tmp/extract/package/subpackage/lamassu-machine ${applicationParentFolder}`),
  async.apply(command, `cp -PR /tmp/extract/package/subpackage/hardware/${hardwareCode}/node_modules ${applicationParentFolder}/lamassu-machine/`),
  async.apply(installDeviceConfig),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
