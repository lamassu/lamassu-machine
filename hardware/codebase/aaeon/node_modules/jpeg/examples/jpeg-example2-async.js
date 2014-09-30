var fs  = require('fs');
var sys = require('sys');
var Jpeg = require('../jpeg').Jpeg;
var Buffer = require('buffer').Buffer;

var WIDTH = 400, HEIGHT = 300;

var rgba = new Buffer(WIDTH*HEIGHT*3);

for (var i=0; i<HEIGHT; i++) {
    for (var j=0; j<WIDTH; j++) {
        rgba[i*WIDTH*3 + j*3 + 0] = 255*j/WIDTH;
        rgba[i*WIDTH*3 + j*3 + 1] = 255*i/HEIGHT;
        rgba[i*WIDTH*3 + j*3 + 2] = 0xff/2;
    }
}

var jpeg = new Jpeg(rgba, WIDTH, HEIGHT, 'rgb');
jpeg.encode(function (jpeg_img) {
    fs.writeFileSync('./jpeg-gradient-async.jpeg', jpeg_img.toString('binary'), 'binary');
});

