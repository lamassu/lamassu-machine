'use strict';

var fs = require('fs');
var path = require('path');

var localePath = path.resolve(__dirname, '..', 'ui', 'js', 'locales.js');
var json = fs.readFileSync(localePath).slice(14, -2).toString();

var results = JSON.parse(json);

Object.keys(results).sort().forEach(function (locale) {
  console.log(locale);
});
