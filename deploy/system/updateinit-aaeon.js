'use strict';

var cp = require('child_process');
var fs = require('fs');
var async = require('./async');
var report = require('./report').report;

var TIMEOUT = 10000;

var hardwareCode = 'aaeon';

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, cb);
}

function detached(cmd, cb) {
  cp.spawn(cmd, [], {detached: true}, cb);
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

function sleep(interval, cb) {
  setTimeout(cb, interval);
}

// Make sure code has been deployed already
if (!fs.existsSync('/opt/apps/machine')) process.exit(1);

async.series([
  async.apply(command, 'mkdir -p /opt/apps/machine/system'),
  async.apply(updateManifest),
  async.apply(report, null, 'finished, restarting lamassu-machine...'),
  async.apply(detached, '/tmp/extract/package/system/' + hardwareCode + '/system1'),
  async.apply(sleep, 20000)  // Give detached process time to run
], function(err) {
  if (err) throw err;
});
