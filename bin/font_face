#!/usr/bin/env node
'use strict';

var fs = require('fs');

var argv = process.argv.slice(2);
var fontDir = argv[0];
var fontName = argv[1];
var root = 'fonts';

var NOTO_WEIGHTS = {
  black: 900,
  bold: 700,
  medium: 500,
  regular: 400,
  light: 200
};

if (argv.length !== 2) {
  console.log('font_face <font dir> <font name>');
  process.exit(1);
}

var fontFiles = fs.readdirSync(root + '/' + fontDir);

fontFiles.forEach(function(fontFile) {
  var fontPath = fontDir + '/' + fontFile;
  var fontWeight = calculateFontWeight(fontFile);

  if (!fontWeight) { return; }

  var out = [
    '@font-face {',
    '  font-family: \'' + fontName + '\';',
    '  src: url(\'fonts/' + fontPath + '\');',
    '  font-weight: ' + fontWeight + ';',
    '  font-style: normal;',
    '}'
  ];

  console.log(out.join('\n') + '\n');
});

// This works for Noto fonts
function calculateFontWeight(fontFile) {
  var base = fontFile.split('.')[0];
  var weight = base.split('-')[1].toLowerCase();
  return NOTO_WEIGHTS[weight];
}
