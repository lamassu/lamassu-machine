const _ = require('lodash/fp')
const spi = require('spi-device')

module.exports = {open, close, setLeds}

function setLeds (leds, codes) {
  const _codes = _.flatten([[0x0, 0x0, 0x0, 0x0], codes, [0xff, 0x0, 0x0, 0x0]])
  const message = [{
    sendBuffer: Buffer.from(_codes),
    byteLength: _codes.length,
    speedHz: 256000,
    mode: 3,
    bitsPerWord: 8
  }]

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

function close (ledP) {
  return new Promise((resolve, reject) => {
    return ledP.close(err => err ? reject(err) : resolve())
  })
}
