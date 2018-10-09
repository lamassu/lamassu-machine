'use strict'

var camera = require('../')
var fs = require('fs')

camera.openCamera({
  singleShot: false,
  // width: 320,
  // height: 240,
  faceDetect: true,
  codec: '.jpg',

  onError: function (err) {
    console.error('camera-wrapper error', err)

    camera.closeCamera()
  },

  onFrame: function (frame) {
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
