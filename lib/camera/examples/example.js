'use strict'

var camera = require('../')
var fs = require('fs')

camera.config({
  debug: true
})

camera.openCamera({
  mock: false,
  mockImage: 'lib/camera/tests/lena.jpg',
  singleShot: false,
  faceDetect: true,
  debug: false,
  verbose: true,
  debugWindow: false,
  validityWindow: true,
  width: 1280,
  height: 720,
  minFaceSize: 1280 * (128 / 640),
  threshold: 7.5,
  threshold2: 200,
  codec: '.jpg',
  onError: function (err) {
    console.error('camera-wrapper error', err)

    camera.closeCamera()
  },
  onFrame: function () {
    console.log('onFrame :: frame size', camera.getFrameSize())
  },
  onFaceDetected: function (frame) {
    console.log('onFaceDetected :: face detected', arguments)
    console.log('onFaceDetected :: frame size', camera.getFrameSize())

    frame = camera.getFrame()
    console.log('onFaceDetected :: writing result.jpg')
    fs.writeFileSync('result.jpg', frame)

    camera.closeCamera()
  }
})
