'use strict';

var fs = require('fs');
var cp = require('child_process');
var report = require('./report').report;

var detectedVersion = null;

var detectedVersion = fs.existsSync('/opt/sencha-brain') ?
  'Version 64' :
  'Not version 64';

function command(cmd, cb) {
  cp.exec(cmd, {timeout: 20000}, function(err) {
    cb(err);
  });
};

report(null, 'started', function() {});

var async = require('./async');

process.on('SIGUSR2', function() {
  // USR1 is reserved by node
  // TODO: more graceful exit
  console.log('Got SIGUSR2. Immune.');
});

async.waterfall([
  async.apply(report, null, detectedVersion),
  async.apply(command, 'killall -9 -qr node')
], function(err) {
  if (err) throw err;
});
