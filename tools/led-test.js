const ledControl = require('../lib/ssuboard/led-control')

const COLORS = ledControl.COLORS
const LEDS = ledControl.LEDS

ledControl.lightUp({type: 'pulse', color: COLORS.orange, range: LEDS.allLeds})

process.on('unhandledRejection', console.log)
