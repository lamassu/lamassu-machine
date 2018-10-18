const _ = require('lodash/fp')
const fs = require('fs')

const camera = require('../lib/camera')

const config = require('../lib/configuration')
  .loadConfig({ 'mockCam': true })

const mode = _.defaultTo(
  _.get('scanner.photoId', config),
  _.get('scanner.photoCard', config))

const opts = _.extendAll({}, mode, {
  debug: true,
  verbose: true,
  faceDetect: true,
  device: _.get('scanner.device', config),
  codec: '.jpg',
  onFaceDetected: function (frame) {
    console.log('** onFaceDetected')

    console.log('writing result.jpg')
    fs.writeFileSync('result.jpg', frame)

    return false
  }
})

console.log('opening camera-wrapper')
camera.openCamera(opts)
