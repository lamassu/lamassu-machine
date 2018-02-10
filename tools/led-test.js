const ledControl = require('../lib/ssuboard/led-control')

const COLORS = ledControl.COLORS
const LEDS = ledControl.LEDS

ledControl.lightUp({type: 'solid', color: COLORS.red, range: LEDS.doorLeds})

setTimeout(() => ledControl.lightDown(), 1000)

setTimeout(() => ledControl.lightUp({type: 'pulse', color: COLORS.amazonite, range: LEDS.doorLeds}), 500)

setTimeout(() => ledControl.lightDown(), 2000)

process.on('unhandledRejection', console.log)
