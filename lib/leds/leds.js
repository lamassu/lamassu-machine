var OPC = require('./opc')
var client = new OPC('localhost', 7890)

let intervalPointer

/*
RED - 163 0 6
GREEN - 63 176 148
BLUE - 27 176 206
*/

function setPixel (pixel, range, color) {
  if (pixel < range[0] || pixel >= range[1]) {
    client.setPixel(pixel, 0x00, 0x00, 0x00)
    return
  }

  client.setPixel(pixel, color[0], color[1], color[2])
}

function setLeds (range, color) {
  for (let pixel = 0; pixel < 512; pixel++) {
    setPixel(pixel, range, color)
  }

  const h = setInterval(() => client.writePixels(), 100)
  setTimeout(() => clearInterval(h), 6000)
}

function validatorOn () {
  const color = [0x00, 0xff, 0x99]
  const range = [42, 48]

  setLeds(range, color)
}

function doorOn () {
  const color = [163, 0, 6]
  const range = [36, 48]

  setLeds(range, color)
}

function flashOnceValidator () {
  validatorOn()
  setTimeout(clear, 500)
}

function flashOnceDoor () {
  doorOn()
  setTimeout(clear, 500)
}

function flashValidator () {
  intervalPointer = setInterval(flashOnceValidator, 1000)
}

function doorOpen () {
  intervalPointer = setInterval(flashOnceDoor, 1000)
}

function clear () {
  setLeds([0, 0], [0x00, 0x00, 0x00])
}

function off () {
  clearInterval(intervalPointer)
  setLeds([0, 0], [0x00, 0x00, 0x00])
}

function color (arr) {
  console.dir(arr)
  setLeds([32, 64], arr)
}

module.exports = {validatorOn, off, flashValidator, color, doorOpen}
