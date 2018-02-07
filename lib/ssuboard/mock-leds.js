module.exports = {open, close, setLeds}

function open () {
  return Promise.resolve('<pointer>')
}

function close () { return Promise.resolve() }

function setLeds (ledP, codes) {
  // console.log('leds: [%s]', codes)
}
