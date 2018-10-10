// const scanner = require('../lib/scanner')
const scanner = require('../lib/mocks/scanner')
const configuration = require('../lib/configuration')
const fs = require('fs')

console.log('configure scanner')
scanner.config(configuration)

console.log('starting camera-wrapper')
scanner.scanPhotoCard(function (err, frame) {
  console.log('scanPhotoCard callback', {err, frame})

  console.log('writing result.jpg')
  fs.createWriteStream('result.jpg').end(frame)
})
