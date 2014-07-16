'use strict';

var async = require('./async');
var cp = require('child_process');
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

async.series([
  async.apply(remountRW),
  async.apply(command, 'cp -a /tmp/extract/package/fonts /opt/apps/machine/lamassu-machine/ui/css'),
  async.apply(remountRO)
], function(err) {
  if (err)
    console.log('Error: %s', err);
});
