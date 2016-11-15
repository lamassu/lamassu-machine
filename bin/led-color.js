const leds = require('../lib/leds/leds')

const colors = process.argv.slice(2, 5).map(s => parseInt(s, 10))
leds.color(colors)

setTimeout(() => process.exit(0), 20000)
