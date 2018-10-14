'use strict'

var camera = require('../')
var fs = require('fs')

camera.config({
  debug: true
})

camera.openCamera({
  mock: true,
  mockImage: 'lib/camera/tests/lena.jpg',

  // width: 0,
  // height: 0,

  // width: undefined,
  // height: undefined,

  // width: 640,
  // height: 480,

  singleShot: true,
  faceDetect: false,
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
