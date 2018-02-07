const _ = require('lodash/fp')
// const BezierEasing = require('bezier-easing')
const tc = require('tinycolor2')
const minimist = require('minimist')(process.argv.slice(2))

const leds = minimist.mockBoard
? require('./mock-leds')
: require('./leds')

// const easing = BezierEasing(0.47, 0.24, 0.95, 0.21)

const LED_COUNT = 26

let effectHandle = null
let lp = null
let currentRange = null

const COLORS = {
  off: '00000000',
  amazonite: '3FB094ff',
  red: 'A30006ff',
  white: 'ffffffff',
  orange: 'F03C02ff',
  orange2: 'FF714Bff'
}

const SCAN_BAY_FADE_IN_MS = 500
const SCAN_BAY_FADE_OUT_MS = 500
const SCAN_BAY_POWER = 0.7

const INDICATOR_FADE = 100

const PULSE_FADE_MS = 300
const PULSE_SOLID_MS = 200
const PULSE_DURATION_MS = 1100

const FRAME_MS = 30 // milliseconds per frame

const LED_BANK = _.range(0, LED_COUNT)

const LEDS = {
  SCAN_BAY_LEDS: [0, 15],
  VALIDATOR_LEDS: [16, 20],
  DISPENSER_LEDS: [21, 25],
  DOOR_LEDS: [16, 25],
  ALL_LEDS: [0, 25]
}

// Pulse amazonite when waiting for bill
// Pulse orange while processing bill

// Pulse orange while dispensing, pulse amazonite when ready to take

// Door: pulse both indicators blue before opening door
// Both indicators solid while open

module.exports = {open, solid, pulse, lightAll, light, timedPulse, off, LEDS, COLORS}

function setLeds (range, color) {
  const arr = _.map(i =>
    _.inRange(range[0], range[1] + 1, i)
    ? ledValues(color)
    : ledValues(0x0),
    LED_BANK)

  return _.flatten(arr)
}

function ledValues (color) {
  return [0xe0 | Math.round(color.a * 31), color.b, color.g, color.r]
}

function light (ledP, range, color) {
  // console.log(color)
  return leds.setLeds(ledP, setLeds(range, color))
}

function lightAll (ledP, color) {
  return leds.setLeds(ledP, setLeds(LEDS.ALL_LEDS, color))
}

function fadeOut (ledP, range, color, period) {
  let frame = 0

  const frames = Math.ceil(period / FRAME_MS)

  return new Promise(resolve => {
    const update = () => {
      const ratio = frame++ / frames
      const currentColor = tc.mix(color, '00000000', ratio * 100).toRgb()
      light(ledP, range, currentColor)

      if (frame > frames) {
        clearInterval(handle)
        return resolve()
      }
    }

    update()
    const handle = setInterval(update, FRAME_MS)
  })
}

function fadeIn (ledP, range, color, period) {
  console.log('DEBUG206')

  let frame = 0

  const frames = Math.ceil(period / FRAME_MS)

  return new Promise(resolve => {
    const update = () => {
      const ratio = frame++ / frames
      const currentColor = tc.mix('00000000', color, ratio * 100).toRgb()
      light(ledP, range, currentColor)

      if (frame > frames) {
        clearInterval(handle)
        return resolve()
      }
    }

    update()
    const handle = setInterval(update, FRAME_MS)
  })
}

function delay (ms) {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  })
}

function singlePulse (ledP, range, color) {
  console.log('DEBUG205: %s', color)

  return fadeIn(ledP, range, color, PULSE_FADE_MS)
  .then(() => delay(PULSE_SOLID_MS))
  .then(() => fadeOut(ledP, range, color, PULSE_FADE_MS))
}

function openLeds () {
  return leds.open()
  .then(_lp => { lp = _lp })
}

function open () {
  if (lp) {
    return endPulse()
    .then(openLeds)
  }

  return openLeds()
}

function pulse (range, color) {
  console.log('DEBUG201')

  return open()
  .then(() => {
    currentRange = range
    console.log('DEBUG203')

    singlePulse(lp, currentRange, color)
    effectHandle = setInterval(() => singlePulse(lp, currentRange, color), PULSE_DURATION_MS)
    return
  })
}

function solid (range, color) {
  console.log('DEBUG300: %s', color)
  return open()
  .then(() => {
    currentRange = range
    light(lp, currentRange, color)
    return
  })
}

function off () {
  if (!lp) return

  light(lp, currentRange, COLORS.off)

  return leds.close(lp)
  .then(() => {
    lp = null
    currentRange = null
  })
}

function endPulse () {
  clearInterval(effectHandle)
  return off()
}

function timedPulse (range, color, period) {
  const interval = (period % PULSE_DURATION_MS) * PULSE_DURATION_MS
  console.log('DEBUG200: %d', interval)

  return pulse(range, color)
  .then(() => delay(interval))
  .then(() => endPulse())
}
