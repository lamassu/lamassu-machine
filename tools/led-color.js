const ledControl = require('../lib/ssuboard/led-control')

const color = process.argv[2]
ledControl.timed({range: ledControl.LEDS.allLeds, color}, 5000)
