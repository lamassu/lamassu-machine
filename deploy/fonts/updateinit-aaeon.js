'use strict';

var async = require('./async');
var cp = require('child_process');
var fs = require('fs');
var report = require('./report').report;
var TIMEOUT = 10000;

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
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

async.series([
  async.apply(command, 'mkdir -p /opt/apps/machine'),
  async.apply(updateManifest),
  async.apply(command, 'cp -a /tmp/extract/package/fonts /opt/apps/machine/lamassu-machine/ui/css'),
  async.apply(report, null, 'finished'),
  async.apply(command, 'killall -9 -qr node')
], function(err) {
  if (err) throw err;
});
