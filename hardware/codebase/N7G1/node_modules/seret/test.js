var fs = require('fs');
var seret = require('./index');

var width = 960;
var height = 720;
var buffer = new Buffer(width * height);

var t0 = Date.now();


seret.cameraOn('/dev/video0', buffer, 960, 720);

console.log(1);
seret.controlSet(0x9a0901, 1);      // Set exposure to manual
console.log(2);
seret.controlSet(0x9a0902, 200);    // Set absolute exposure
console.log(3);
seret.controlSet(0x9a0903, 0);      // Turn off auto priority exposure

seret.startCapture();

console.log(Date.now() - t0);
seret.captureFrame();
console.log(Date.now() - t0);
seret.captureFrame();
seret.controlSet(0x9a0902, 200);    // Set absolute exposure
console.log(Date.now() - t0);
fs.writeFileSync('./result.gray', buffer);
console.log(Date.now() - t0);
seret.stopCapture();
console.log(Date.now() - t0);

seret.startCapture('/dev/video0', buffer, 960, 720);
console.log(Date.now() - t0);
seret.captureFrame();
console.log(Date.now() - t0);
seret.captureFrame();
console.log(Date.now() - t0);
fs.writeFileSync('./result2.gray', buffer);
console.log(Date.now() - t0);
seret.stopCapture();
console.log(Date.now() - t0);
seret.cameraOff();
