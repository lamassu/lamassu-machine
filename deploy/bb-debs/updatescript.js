'use strict';

var fs = require('fs');
var zlib = require('zlib');
var async = require('./async');
var cp = require('child_process');

var TIMEOUT = 120000;

var hardwareCode = process.argv[2] || 'N7G1';

function report(err, cb) {
  console.log('> report', err);
  if (!cb && typeof(err) === 'function') {
    cb = err;
    err = null;
  }
  
  fs.writeFileSync('log', err)

  try {
      require('./report').report(err, 'finished.', cb);
  } catch (err) {
      cb(err);
  }
}

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err, stdout, stderr) {
    console.log('> ' + cmd);
    if (err && stderr)  err.stderr = stderr;
    cb(err);
  });
}

function installDebs(cb) {
    async.series([
      async.retry(2, async.apply(command, 'apt install -y libopencv-core2.4 libopencv-highgui2.4 libopencv-imgproc2.4 libopencv-video2.4 libopencv-features2d2.4 libopencv-objdetect2.4')),
    ], cb);
}

async.series([
  async.apply(installDebs),
  async.apply(report)
], function(err) {
  async.series([
    async.apply(report, err),
  ], function (err2) {
    if (err2) throw err2;
    else throw err;
  });
});
