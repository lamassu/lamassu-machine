const ledControl = require('../lib/upboard/sintra/led-control')

const color = process.argv[2]
ledControl.timed({range: ledControl.LEDS.allLeds, color}, 5000)
