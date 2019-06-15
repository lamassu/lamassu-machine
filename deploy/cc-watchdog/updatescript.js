'use strict';

var fs = require('fs');
var async = require('./async');
var cp = require('child_process');
var report = require('./report').report;

var hardwareCode = process.argv[2];
var TIMEOUT = 120000;
var applicationParentFolder = hardwareCode === 'aaeon' ? '/opt/apps/machine' : '/opt';

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

async.series([

  async.apply(command, `cp /tmp/extract/package/watchdog.js ${applicationParentFolder}/lamassu-machine/`),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
