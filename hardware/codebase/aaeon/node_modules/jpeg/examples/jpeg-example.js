var fs  = require('fs');
var sys = require('sys');
var Jpeg = require('../jpeg').Jpeg;
var Buffer = require('buffer').Buffer;

var rgba = fs.readFileSync('./rgba-terminal.dat');

var jpeg = new Jpeg(rgba, 720, 400, 'rgba');
var jpeg_img = jpeg.encodeSync().toString('binary');

fs.writeFileSync('./jpeg.jpeg', jpeg_img, 'binary');

