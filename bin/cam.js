const cam = require('../lib/camera')

cam.openCamera({
  verbose: true,
  input: '/dev/video0',
  codec: '.jpg',
  width: 640,
  height: 480,
  singleShot: true,
  onFrame: frame => {
    console.log(cam.getFrameSize(), frame)
    require('fs').createWriteStream('result.jpg').end(frame)
  }
})
