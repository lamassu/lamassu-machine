'use strict';

var cp = require('child_process');
var async = require('./async');
var report = require('./report').report;

const hardwareCode = process.argv[2].toLowerCase();
var TIMEOUT = 10000;

let purgeCommand = null
if (hardwareCode === 'aaeon')
  purgeCommand = 'rm /var/lib/lamassu-machine/log/*; rm /var/lib/lamassu-machine/tx-db/*; rm /var/log/upstart/lamassu-*.log.*; truncate -s 0 /var/log/upstart/lamassu-*.log'
else if (hardwareCode === 'ssuboard' || hardwareCode === 'upboard')
  purgeCommand = 'rm /opt/lamassu-machine/data/log/*; rm /opt/lamassu-machine/data/tx-db/*; rm /var/log/supervisor/lamassu-*.*.log.*; truncate -s 0 /var/log/supervisor/lamassu-*.*.log'
else purgeCommand = ''

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

async.series([

  async.apply(command, purgeCommand),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
