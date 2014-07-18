'use strict';

var fs = require('fs');
var path = require('path');

var Parser = require('../../lib/compliance/parsepdf417');

var licenseDir = path.join(__dirname, '../../mock_data/compliance');
var data = fs.readFileSync(licenseDir + '/nh.dat', 'utf8');

var ScanId = function(config) {
  this.config = config;
};

module.exports = ScanId;

ScanId.factory = function factory(config) {
  return new ScanId(config);
};

ScanId.prototype.scan = function scan(cb) {
  setTimeout(function() {
    cb(null, Parser.parse(data));
  }, 1500);
};
