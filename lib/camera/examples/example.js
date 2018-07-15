'use strict'

var camera = require('../')
var fs = require('fs')

camera.openCamera({
  // width: 320,
  // height: 240,
  faceDetect: true,
  // codec: '.jpg',
  onFaceDetected: function () {
    console.log('face detected')
    console.log('frame size', camera.getFrameSize())

    var frame = camera.getFrame()
    fs.writeFileSync('result.jpg', frame)

    camera.closeCamera()
  }
})
