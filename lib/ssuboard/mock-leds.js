module.exports = {open, close, setLeds}

let lp = null

function open () {
  if (lp) throw new Error('LEDs already open!')
  console.log('LEDs opened.')
  lp = '<pointer>'
  return Promise.resolve(lp)
}

function close () {
  if (!lp) throw new Error('LEDs not open')
  lp = null
  return Promise.resolve()
}

function setLeds (ledP, codes) {
  if (!lp) throw new Error('LEDs not open')
  console.log('leds: [%s]', codes)
}
