'use strict';

var cp = require('child_process');
var fs = require('fs');
var async = require('./async');

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

// Make sure code has been deployed already
if (!fs.existsSync('/opt/apps/machine')) process.exit(1);

async.series([
  async.apply(remountRW),
  async.apply(command, 'mkdir -p /opt/apps/machine/system'),
  async.apply(command, 'cp -a /tmp/extract/package/system/' + hardwareCode + '/xinitrc /opt/apps/machine/system'),
  async.apply(command, 'cp -a /tmp/extract/package/system/' + hardwareCode + '/inittab /etc'),
  async.apply(poweroff)
], function(err) {
  if (err)
    console.log('Error: %s', err);
});
