var fs = require('fs');
var json = fs.readFileSync('../ui/js/locales.js').slice(14, -1).toString();
var results = JSON.parse(json);

Object.keys(results).sort().forEach(function (locale) {
  console.log(locale);
});
