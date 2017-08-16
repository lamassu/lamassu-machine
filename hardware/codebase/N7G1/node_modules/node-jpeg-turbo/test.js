const fs = require('fs')
const jpg = require('./index')

const frame = fs.readFileSync('./image.jpg')
const greyscale = jpg.decompressSync(frame, {format: jpg.FORMAT_GRAY})

console.log('Image size: %d', greyscale.data.length)
