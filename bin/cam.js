const fs = require('fs')

const scanner = require('../lib/scanner')

const frameCb = function (err, frame) {
  console.log('frame callback', { err, frame })

  console.log('writing result.jpg')
  fs.writeFileSync('result.jpg', frame)
}

console.log('starting scanner')
scanner.scanPhotoCard(frameCb)
