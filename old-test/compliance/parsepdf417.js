'use strict';

var fs = require('fs');
var path = require('path');
var assert = require('chai').assert;
var parser = require('../../lib/compliance/parsepdf417');

var licenseDir = path.join(__dirname, 'licenses');

describe('ParsePdf417', function() {
  describe('parse', function() {
    it('should return the correct data for MA', function() {
      var data = fs.readFileSync(licenseDir + '/ma.dat', 'utf8');
      var expected = JSON.parse(fs.readFileSync(licenseDir + '/ma.json'));
      var result = parser.parse(data);
      for (var field in expected) {
        assert.equal(result[field], expected[field], field);
      }
    });
    it('should return the correct data for NH', function() {
      var data = fs.readFileSync(licenseDir + '/nh.dat', 'utf8');
      var expected = JSON.parse(fs.readFileSync(licenseDir + '/nh.json'));
      var result = parser.parse(data);
      for (var field in expected) {
        assert.equal(result[field], expected[field], field);
      }
    });
  });
});