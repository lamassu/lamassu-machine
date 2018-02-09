module.exports = {open, close, setLeds}

function open () {
  console.log('LEDs opened.')
  return Promise.resolve('<pointer>')
}

function close () {
  console.log('LEDs closed.')
  return Promise.resolve()
}

function setLeds (ledP, codes) {
  console.log('leds: [%s]', codes)
}
