const tc = require('tinycolor2')
const leds = require('../lib/ssuboard/leds')
const ledControl = require('../lib/ssuboard/led-control')

const color = tc(process.argv[2]).toRgb()

leds.open()
.then(ledP => ledControl.lightAll(ledP, color))

setTimeout(() => process.exit(0), 20000)
