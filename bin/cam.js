// const scanner = require('../lib/scanner')
const scanner = require('../lib/mocks/scanner')

const configuration = require('../lib/configuration').loadConfig({
  'mockCam': true
})
const fs = require('fs')
const cam = require('../lib/camera')

const frameCb = function (err, frame) {
  console.log('frame callback', {err, frame})
  console.log('frame size ', cam.getFrameSize())

  console.log('writing result.jpg')
  fs.writeFileSync('result.jpg', frame)
}

function scannerTest () {
  console.log('configure scanner')
  scanner.config(configuration)

  console.log('starting scanner')
  scanner.scanPhotoCard(frameCb)
}

function cameraWrapperTest () {
  console.log('opening camera-wrapper')
  cam.openCamera({
    verbose: true,
    input: '/dev/video0',
    codec: '.jpg',
    width: 640,
    height: 480,
    singleShot: true,
    onError: frameCb,
    onFrame: function (frameRaw) {
      frameCb(null, frameRaw)
    },
    onFaceDetected: function (frameRaw) {
      frameCb(null, frameRaw)
    }
  })
}

scannerTest()
// cameraWrapperTest()
