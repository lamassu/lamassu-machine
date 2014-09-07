'use strict';

var async = require('./async');
var cp = require('child_process');
var report = require('./report').report;

var TIMEOUT = 10000;

var hardwareCode = process.argv[2] || 'N7G1';

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function reboot(cb) {
  if (hardwareCode === 'N7G1')
    return command('poweroff -d 2', cb);

  command('restart lamassu-extractor', cb);
}

function remountRW(cb) {
  if (hardwareCode !== 'N7G1') return cb();
  command('/bin/mount -o remount,rw /', cb);
}

async.series([
  async.apply(remountRW),
  async.apply(command, 'cp -a /tmp/extract/package/update /opt/apps/machine/lamassu-machine/lib'),
  async.apply(command, 'cp -a /tmp/extract/package/watchdog.js /opt/apps/machine/lamassu-machine'),
  async.apply(reboot),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
