const _ = require('lodash/fp')
const spi = require('spi-device')

module.exports = {open, setLeds}

function setLeds (leds, codes) {
  const _codes = _.flatten([[0x0, 0x0, 0x0, 0x0], codes, [0xff, 0x0, 0x0, 0x0]])
  const message = [{
    sendBuffer: Buffer.from(_codes),
    byteLength: _codes.length,
    speedHz: 256000,
    mode: 3,
    bitsPerWord: 8
  }]

  console.log(message)
  leds.transfer(message, err => {
    if (err) throw err
  })
}

function open () {
  return new Promise((resolve, reject) => {
    const leds = spi.open(1, 0, err => {
      if (err) return reject(err)
      return resolve(leds)
    })
  })
}
