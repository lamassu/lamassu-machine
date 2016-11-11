var scanner = require('../lib/scanner')
var LICENSES = require('../licenses.json')

var config = {
  device: '/dev/video0',
  qr: {
    width: 640,
    height: 480,
    contrast: 30,
    lowExposure: 75,
    highExposure: null,
    exposureAdjustTime: 200
  },
  photoId: {
    width: 1280,
    height: 960,
    contrast: 25,
    lowExposure: null,
    highExposure: null,
    exposureAdjustTime: 200
  },
  manatee: LICENSES.scanner.manatee
}

console.log('version 1.0.3')
scanner.config(config)
try {
  console.log('DEBUG1')
  scanner.scanMainQR('BTC', function (err, address) {
    console.log('DEBUG2')
    if (err) console.log('scanMainQR error: %s', err)
    if (address) console.log(address)
    console.log('done.')
  })
} catch (err) {
  console.log('In catch: %s', err)
}
