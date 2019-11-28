const cp = require('child_process')
const delay = require('delay')

const PULSE_EXEC = '/opt/leds'

const COLORS = {
  off: '00000000',
  amazonite: '3FB094ff',
  red: 'A30006ff',
  white: 'ffffffff',
  dimmed: '666666',
  orange: 'F03C02ff',
  orange2: 'FF714Bff'
}

module.exports = { lightUp, lightDown, timed, COLORS }

let child = null

function lightUp (opts) {
  const range = opts.range
  const color = opts.color
  const rgb = colorToRgb(color)
  const pulse = opts.type === 'pulse' ? 1 : 0

  return kill()
    .then(() => {
      child = cp.execFile(PULSE_EXEC, [pulse, rgb.r, rgb.g, rgb.b, range[0], range[1]])
    })
}

function lightDown () {
  return kill()
}

function timed (opts, duration) {
  return lightUp(opts)
    .then(() => delay(duration))
    .then(kill)
}

function kill () {
  return new Promise((resolve, reject) => {
    if (!child) return resolve()
    child.on('exit', resolve)
    child.kill()
  })
    .then(() => {
      child = null
    })
}

function colorToRgb (color) {
  return {
    r: color.slice(0, 2),
    g: color.slice(2, 4),
    b: color.slice(4, 6)
  }
}
