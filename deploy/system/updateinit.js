'use strict';

var cp = require('child_process');
var fs = require('fs');
var async = require('./async');
var report = require('./report').report;

var TIMEOUT = 10000;

var hardwareCode = process.argv[2] || 'N7G1';

// This is only relevant to the N7G1
if (hardwareCode !== 'N7G1') process.exit(0);

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function remountRW(cb) {
  command('mount -o remount,rw /dev/root', cb);
}

function poweroff(cb) {
  command('poweroff -d 2', cb);
}

function updateManifest(cb) {
  var manifestPath = '/opt/apps/machine/manifest.json';
  fs.readFile(manifestPath, function (err, data) {
    if (err && err.code !== 'ENOENT') return cb(err);
    var manifest = {};
    if (!err) manifest = JSON.parse(data);
    manifest.packages = manifest.packages || [];
    if (manifest.packages.indexOf('system1') !== -1) return cb();
    manifest.packages.push('system1');
    fs.writeFile(manifestPath, JSON.stringify(manifest), function (err) {
      cb(err);
    });
  });
}

// Make sure code has been deployed already
if (!fs.existsSync('/opt/apps/machine')) process.exit(1);

async.series([
  async.apply(remountRW),
  async.apply(command, 'mkdir -p /opt/apps/machine/system'),
  async.apply(updateManifest),
  async.apply(command, '/tmp/extract/package/system/' + hardwareCode + '/system1'),
  async.apply(poweroff)
], function(err) {
  if (err) return console.log('Error: %s', err);
  report(err, 'finished', function() {
    console.log('finished');
  });
});
