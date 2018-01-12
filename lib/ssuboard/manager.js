const nfc = require('./nfc')
const io = require('./io')
const leds = require('./leds')
const ledControl = require('./led-control')

const LEDS = ledControl.LEDS
const COLORS = ledControl.COLORS

const ledP = led
module.exports = {run}

function run () {
  return leds.open(ledP => {
    io.run()
    .then(() => {
      nfc.emitter.on('cardPresent', io.openDoor)
      io.emitter.on('doorOpen', () => ledControl.light(ledP, LEDS.DOOR_LEDS, COLORS.amazonite))
      io.emitter.on('doorClosed', () => ledControl.light(ledP, LEDS.DOOR_LEDS, COLORS.off))
      nfc.run()
    })
  })
}
