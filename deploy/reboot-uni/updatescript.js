'use strict';

var cp = require('child_process');
var async = require('./async');
var report = require('./report').report;

const hardwareCode = process.argv[2].toLowerCase();
var TIMEOUT = 10000;

let restartCommand = null
if (hardwareCode === 'aaeon')
  restartCommand = 'restart lamassu-machine; killall chromium-browser'
else if (hardwareCode === 'ssuboard')
  restartCommand = 'supervisorctl restart lamassu-machine lamassu-browser'
else restartCommand = ''

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

async.series([

  async.apply(command, restartCommand),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
