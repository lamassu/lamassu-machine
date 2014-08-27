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

function remountRW(cb) {
  if (hardwareCode !== 'N7G1') return cb();
  command('mount -o remount,rw /dev/root', cb);
}

var fontsCommand = '/tmp/extract/package/remote_install';
async.series([
  async.apply(remountRW),
  async.apply(command, fontsCommand),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
