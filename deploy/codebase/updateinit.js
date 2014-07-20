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

function poweroff(cb) {
  if (hardwareCode !== 'N7G1') return cb();
  command('poweroff -d 2', cb);
}

async.series([
  async.apply(remountRW),
  async.apply(command, 'mkdir -p /opt/apps/machine'),  
  async.apply(command, 'cp -a /tmp/extract/package/lamassu-machine /opt/apps/machine'),
  async.apply(command, 'cp -a /tmp/extract/package/hardware/' + hardwareCode + '/node_modules /opt/apps/machine/lamassu-machine'),
  async.apply(command, 'cp /tmp/extract/package/hardware/' + hardwareCode + '/device_config.json /opt/apps/machine/lamassu-machine'),
  async.apply(poweroff)
], function(err) {
  if (err)
    console.log('Error: %s', err);
});
