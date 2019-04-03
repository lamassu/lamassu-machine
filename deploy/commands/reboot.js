'use strict';

var cp = require('child_process');
var async = require('./async');
var report = require('./report').report;

const hardwareCode = process.argv[2].toLowerCase();

let restartCommand = null
if (hardwareCode === 'aaeon')
  restartCommand = 'restart lamassu-machine; killall chromium-browser'
else if (hardwareCode === 'ssuboard')
  restartCommand = 'supervisorctl restart all'
else restartCommand = ''


report(null, 'started', function() {});

var TIMEOUT = 10000;

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

console.log('********** STARTED *************');

// TODO: not idempotent, base this on versions
async.waterfall([
  async.apply(report, null, 'started'),
  async.apply(command, restartCommand),
  async.apply(report, null, 'afterRestart'),
], function(err) {
  report(err, 'finished', function() {
    if (err) throw err;
    console.log('done updatescript');
    process.exit();
  });
});
