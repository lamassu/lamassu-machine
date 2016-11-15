const fs = require('fs')
const nfc = require('../lib/nfc')
const door = require('../lib/door')
const leds = require('../lib/leds/leds')

const pinPath = '/sys/class/gpio/gpio95/value'

nfc.emitter.on('cardInserted', () => {
  console.log('Opening door...')
  door.open()
})

let doorOpen = false

function testDoor () {
  const statusStr = fs.readFileSync(pinPath, 'utf8')
  const status = statusStr.slice(0, 1) === '1'

  if (status === doorOpen) return
  doorOpen = status

  if (status) {
    console.log('door open')
    return leds.doorOpen()
  }

  console.log('door closed')
  leds.off()
}

if (!fs.existsSync(pinPath)) {
  fs.writeFileSync('/sys/class/gpio/export', '95')
}

setInterval(testDoor, 100)
