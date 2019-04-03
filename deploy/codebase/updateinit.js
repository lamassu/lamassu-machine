'use strict';

var fs = require('fs');
var zlib = require('zlib');
var async = require('./async');
var cp = require('child_process');
var report = require('./report').report;
var tar = require('/opt/apps/machine/lamassu-machine/node_modules/tar');

var TIMEOUT = 120000;

var hardwareCode = process.argv[2] || 'N7G1';

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function remountRW(cb) {
  if (hardwareCode !== 'N7G1') return cb();
  command('/bin/mount -o remount,rw /', cb);
}

function untar(tarball, outPath, cb) {
  var fileIn = fs.createReadStream(tarball);
  fileIn.pipe(zlib.createGunzip()).pipe(tar.Extract(outPath))
  .on('error', cb)
  .on('end', cb);   // success
}

function installBarcodeLib(cb) {
  if (hardwareCode !== 'aaeon') return cb();
  var cmd = 'cp -p /tmp/extract/package/subpackage/hardware/aaeon/lib/libBarcodeScanner.so /usr/lib';
  command(cmd, cb);
}

function installDeviceConfig (cb) {
  try {
    const currentDeviceConfigPath = '/opt/apps/machine/lamassu-machine'
    const newDeviceConfigPath = '/tmp/extract/package/subpackage/hardware/' + hardwareCode + '/device_config.json'
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
    fs.writeFileSync(newDeviceConfigPath, adjustedDeviceConfig)

    const cmd = 'cp /tmp/extract/package/subpackage/hardware/' + hardwareCode + '/device_config.json /opt/apps/machine/lamassu-machine'
    command(cmd, cb)
  }
  catch (err) {
    cb(err)
  }
}

function installSys(cb) {
  if (hardwareCode !== 'N7G1') return cb();
  async.series([
    async.apply(command, 'cp -p /tmp/extract/package/subpackage/hardware/N7G1/sys/xinitrc /opt/apps/machine/system'),
    async.apply(command, 'cp -p /tmp/extract/package/subpackage/hardware/N7G1/sys/inittab /etc')
  ], cb);
}


async.series([
  async.apply(remountRW),
  async.apply(command, 'mkdir -p /opt/apps/machine'),
  async.apply(untar, '/tmp/extract/package/subpackage.tgz', '/tmp/extract/package/'),
  async.apply(installSys),
  async.apply(command, 'cp -a /tmp/extract/package/subpackage/lamassu-machine /opt/apps/machine'),
  async.apply(command, 'cp -a /tmp/extract/package/subpackage/hardware/' + hardwareCode + '/node_modules /opt/apps/machine/lamassu-machine'),
  async.apply(command, 'cp -a /tmp/extract/package/subpackage/hardware/' + hardwareCode + '/bin /opt/apps/machine/lamassu-machine'),
  async.apply(installDeviceConfig),
  async.apply(installBarcodeLib),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
