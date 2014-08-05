'use strict';

var cp = require('child_process');
var report = require('./report').report;
var async = require('./async');

var hardwareCode = process.argv[2] || 'N7G1';

var psCommand = hardwareCode === 'N7G1' ?
  'ps -o pid,rss,comm,args' :
  'ps aux';

report(null, 'started', function() {});


var TIMEOUT = 10000;

function reportCommand(cmd, args, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function (error, stdout) {
    report(null, stdout, cb);
  });
}

console.log('********** STARTED *************');

async.waterfall([
  async.apply(report, null, 'started'),
  async.apply(reportCommand, psCommand)
], function(err) {
  report(err, 'finished', function() {
    if (err) throw err;
    console.log('done updatescript');
    process.exit();
  });
});
