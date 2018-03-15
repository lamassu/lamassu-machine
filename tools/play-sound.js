const path = require('path')
const playSound = require('../lib/ssuboard/play-sound')

const filePath = process.argv[2]

console.log(filePath)

setInterval(() => playSound.play(filePath), 1000)
setTimeout(() => process.exit(0), 6000)

