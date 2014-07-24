'use strict';

var async = require('./async');
var cp = require('child_process');
var TIMEOUT = 10000;

var hardwareCode = 'aaeon';

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

async.series([
  async.apply(command, 'mkdir -p /opt/apps/machine'),  
  async.apply(command, 'cp -a /tmp/extract/package/lamassu-machine /opt/apps/machine'),
  async.apply(command, 'cp -a /tmp/extract/package/hardware/' + hardwareCode + '/node_modules /opt/apps/machine/lamassu-machine'),
  async.apply(command, 'cp /tmp/extract/package/hardware/' + hardwareCode + '/device_config.json /opt/apps/machine/lamassu-machine')
], function(err) {
  if (err)
    console.log('Error: %s', err);
});
