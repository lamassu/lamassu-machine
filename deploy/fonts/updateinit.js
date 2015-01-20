'use strict';

var fs = require('fs');
var zlib = require('zlib');
var async = require('./async');
var cp = require('child_process');
var report = require('./report').report;
var tar = require('/opt/apps/machine/lamassu-machine/node_modules/tar');

var TIMEOUT = 10000;

var hardwareCode = process.argv[2] || 'N7G1';

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function remountRW(cb) {
  if (hardwareCode !== 'N7G1') return cb();
  command('/bin/mount -o remount,rw /', cb);
}

function untar(tarball, outPath, cb) {
  var fileIn = fs.createReadStream(tarball);
  fileIn.pipe(zlib.createGunzip()).pipe(tar.Extract(outPath))
  .on('error', cb)
  .on('end', cb);   // success
}

function copyFonts(cb) {
  if (hardwareCode !== 'N7G1') {
    var fontDir = fs.readdirSync('/tmp/extract/package/subpackage')[0];
    try { fs.mkdirSync('/var/lib/sencha/fonts'); } catch(ex) {}
    command('cp -a /tmp/extract/package/subpackage/' + fontDir +
        ' /var/lib/sencha/fonts', function() {
      fs.symlinkSync('/tmp/extract/package/subpackage/' + fontDir,
        '/opt/apps/machine/lamassu-machine/ui/css/fonts' + fontDir);
      cb();
    });
  } else {
    var cmd = 'cp -a /tmp/extract/package/subpackage/* ' +
      '/opt/apps/machine/lamassu-machine/ui/css/fonts';
    command(cmd, cb);
  }
}

async.series([
  async.apply(remountRW),
  async.apply(command, 'mkdir -p /opt/apps/machine'),
  async.apply(untar, '/tmp/extract/package/subpackage.tgz', '/tmp/extract/package/'),
  async.apply(copyFonts),
  async.apply(report, null, 'finished.')
], function(err) {
  if (err) throw err;
});
