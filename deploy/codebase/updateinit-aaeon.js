'use strict';

var async = require('./async');
var cp = require('child_process');
var report = require('report').report;

var TIMEOUT = 10000;

var hardwareCode = 'aaeon';

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function command(cmd, cb) {
  cp.exec(cmd, {timeout: 20000}, function(err) {
    cb(err);
  });
}

report(null, 'started', function() {});


async.series([
  async.apply(command, 'mkdir -p /opt/apps/machine'),  
  async.apply(command, 'cp -a /tmp/extract/package/lamassu-machine /opt/apps/machine'),
  async.apply(command, 'cp -a /tmp/extract/package/hardware/' + hardwareCode + '/node_modules /opt/apps/machine/lamassu-machine'),
  async.apply(command, 'cp /tmp/extract/package/hardware/' + hardwareCode + '/device_config.json /opt/apps/machine/lamassu-machine'),
  async.apply(command, 'killall -9 -qr node')  
], function(err) {
  if (err) return console.log('Error: %s', err);
  report(err, 'finished', function() {
    console.log('finished');
  });
});
