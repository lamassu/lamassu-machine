const ledControl = require('../lib/ssuboard/led-control')

const COLORS = ledControl.COLORS
const LEDS = ledControl.LEDS

ledControl.timed({type: 'pulse', color: COLORS.orange, range: LEDS.doorLeds}, 5000)

process.on('unhandledRejection', console.log)
