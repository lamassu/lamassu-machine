// Run through a directory of images and measure manatee performance

'use strict';

var fs = require('fs');
var manatee = require('manatee');

//var config = require('../device_config.json');

//var licenses = config.scanner.manatee.license;
//manatee.register('qr', licenses.qr.name, licenses.qr.key);
//manatee.register('pdf417', licenses.pdf417.name, licenses.pdf417.key);

console.log(manatee.version());

var width = 1280;
var height = 960;

//var files = fs.readdirSync('/tmp/paper-sub25exposure');
var rootDir = process.argv[2];
var files = fs.readdirSync(rootDir);

manatee.scanningLevel = 5;

files.forEach(function(file) {
  if (file.match(/\.gray$/) === null) return;

  var image = fs.readFileSync(rootDir + '/' + file);

  var t0 = process.hrtime();
  var result = manatee.scanQR(image, width, height);
  var success = result ? 'SUCC' : 'FAIL';
  var elapsedRec = process.hrtime(t0);
  var elapsed = elapsedRec[0] * 1e9 + elapsedRec[1];
  console.log('%s\t%s\t%s', success, elapsed, file);
});
