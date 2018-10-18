const fs = require('fs')

const scanner = require('../lib/scanner')
const cam = require('../lib/camera')

const configuration = require('../lib/configuration')
  .loadConfig({ 'mockCam': true })

const frameCb = function (err, frame) {
  console.log('frame callback', {err, frame})
  console.log('frame size ', cam.getFrameSize())

  console.log('writing result.jpg')
  fs.writeFileSync('result.jpg', frame)
}

console.log('configure scanner')
scanner.config(configuration)

console.log('starting scanner')
scanner.scanPhotoCard(frameCb)
