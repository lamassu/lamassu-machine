'use strict';

var async = require('./async');
var cp = require('child_process');
var fs = require('fs');
var report = require('./report').report;

var TIMEOUT = 10000;

var hardwareCode = process.argv[2] || 'N7G1';

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function remountRW(cb) {
  if (hardwareCode !== 'N7G1') return cb();
  command('mount -o remount,rw /dev/root', cb);
}

function remountRO(cb) {
  if (hardwareCode !== 'N7G1') return cb();
  command('mount -o remount,ro /dev/root', cb);
}

function updateManifest(cb) {
  var manifestPath = '/opt/apps/machine/manifest.json';
  fs.readFile(manifestPath, function (err, data) {
    if (err && err.code !== 'ENOENT') return cb(err);
    var manifest = {};
    if (!err) manifest = JSON.parse(data);
    manifest.packages = manifest.packages || [];
    if (manifest.packages.indexOf('fonts') !== -1) return cb();
    manifest.packages.push('fonts');
    fs.writeFile(manifestPath, JSON.stringify(manifest), function (err) {
      cb(err);
    });
  });
}

var fontsCommand = '/tmp/extract/package/install /tmp/extract/package/fonts.css ' + 
  '/tmp/extract/package/fonts /opt/apps/machine/lamassu-machine';
async.series([
  async.apply(remountRW),
  async.apply(command, 'mkdir -p /opt/apps/machine'),
  async.apply(updateManifest),
  async.apply(command, fontsCommand),
  async.apply(remountRO),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
