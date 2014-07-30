'use strict';

var fs = require('fs');
var path = require('path');

var newFontsCssPath = process.argv[2];
var basePath = process.argv[3];

if (!newFontsCssPath || !basePath) {
  console.log('Usage: node fonts_css.js <css path> <lamassu-machine dir>');
  console.log('Example: node fonts_css.js css/source-hans-sans-cn.css .');
  process.exit(2);
}

var newFontsCss = fs.readFileSync(newFontsCssPath);
var re = /\[([a-z\-]+)\]/;
var fontCodes = re.exec(newFontsCss);

if (!fontCodes || fontCodes.length !== 2) {
  console.log('Invalid font css file: ' + newFontsCssPath);
  process.exit(3);
}

var fontFamily = fontCodes[1];

var fontsCssPath = path.resolve(basePath, 'ui', 'css', 'fonts.css');
var fontsCss = '';

try {
  fontsCss = fs.readFileSync(fontsCssPath, {encoding: 'utf8'});
} catch(ex) {
  // noop
}

if (fontsCss.indexOf('[' + fontFamily + ']') > -1) {
  console.log('Fonts already installed.');
  process.exit(1);
}

fs.appendFileSync(fontsCssPath, newFontsCss);

console.log('fonts.css successfully updated.');
