const ledControl = require('../lib/ssuboard/led-control')

const COLORS = ledControl.COLORS
const LEDS = ledControl.LEDS

ledControl.lightUp({type: 'solid', color: COLORS.red, range: LEDS.doorLeds})
