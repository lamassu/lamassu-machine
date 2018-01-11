const spi = require('spi-device')

// NOTE: 0xff, B, G, R

function dimRed (val) {
  return [
    0x0, 0x0, 0x0, 0x0,
    0xff, 0x0, 0x0, val,
    0xff, 0x0, 0x0, 0xff - val,
    0xff, 0x0, 0x0, 0x0,
    0xff, 0x0, 0x0, 0x0
  ]
}

function setLeds (codes) {
  const message = [{
    sendBuffer: Buffer.from(codes),
    byteLength: codes.length,
    speedHz: 256000,
    mode: 3,
    bitsPerWord: 8
  }]

  leds.transfer(message, (err, message) => {
    if (err) throw err
  })
}

let val = 0x0

const leds = spi.open(1, 0, err => {
  if (err) throw err

  setInterval(() => {
    val = (val + 1) % 0xff
    setLeds(dimRed(val))
  }, 5)
})
