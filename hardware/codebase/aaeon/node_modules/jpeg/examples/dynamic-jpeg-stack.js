var JpegLib = require('jpeg');
var fs = require('fs');
var sys = require('sys');
var Buffer = require('buffer').Buffer;

// --------

var terminal = fs.readFileSync('./rgba-terminal.dat');

var jpegStack = new JpegLib.DynamicJpegStack('rgba');
jpegStack.setBackground(terminal, 720, 400);

function rectDim(fileName) {
    var m = fileName.match(/^\d+-rgba-(\d+)-(\d+)-(\d+)-(\d+).dat$/);
    var dim = [m[1], m[2], m[3], m[4]].map(function (n) {
        return parseInt(n, 10);
    });
    return { x: dim[0], y: dim[1], w: dim[2], h: dim[3] }
}

var files = fs.readdirSync('./push-data');

files.forEach(function(file) {
    var dim = rectDim(file);
    var rgba = fs.readFileSync('./push-data/' + file);
    jpegStack.push(rgba, dim.x, dim.y, dim.w, dim.h);
});

fs.writeFileSync('dynamic.jpg', jpegStack.encodeSync().toString('binary'), 'binary');

var dims = jpegStack.dimensions();

sys.puts("x: " + dims.x + ", y: " + dims.y + ", w: " + dims.width + ", h: " + dims.height);
