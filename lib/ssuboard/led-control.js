const _ = require('lodash/fp')

// const BezierEasing = require('bezier-easing')
const tc = require('tinycolor2')
const minimist = require('minimist')(process.argv.slice(2))

const ledSm = require('./led-sm')

const leds = minimist.mockBoard
? require('./mock-leds')
: require('./leds')

// const easing = BezierEasing(0.47, 0.24, 0.95, 0.21)

const LED_COUNT = 26

let effectHandle = null
let lp = null

let currentScheme = null
let pendingScheme = null

const COLORS = {
  off: '00000000',
  amazonite: '3FB094ff',
  red: 'A30006ff',
  white: 'ffffffff',
  orange: 'F03C02ff',
  orange2: 'FF714Bff'
}

const LEDS = {
  scanBayLeds: [0, 15],
  validatorLeds: [16, 20],
  dispenserLeds: [21, 25],
  doorLeds: [16, 25],
  allLeds: [0, 25]
}

// const SCAN_BAY_FADE_IN_MS = 500
// const SCAN_BAY_FADE_OUT_MS = 500
// const SCAN_BAY_POWER = 0.7

// const INDICATOR_FADE = 100

const PULSE_FADE_MS = 300
const PULSE_SOLID_MS = 200
const PULSE_DURATION_MS = 1100

const FRAME_MS = 30 // milliseconds per frame

const LED_BANK = _.range(0, LED_COUNT)

// Pulse amazonite when waiting for bill
// Pulse orange while processing bill

// Pulse orange while dispensing, pulse amazonite when ready to take

// Door: pulse both indicators blue before opening door
// Both indicators solid while open

module.exports = {lightUp, lightDown, LEDS, COLORS}

const actionMap = {
  lightSolid,
  lightPulse,
  pulseOff,
  ledsOff,
  reset
}

ledSm.start(actionMap)

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

function light (color) {
  return leds.setLeds(lp, setLeds(currentScheme.range, color))
}

function fadeOut (period) {
  let frame = 0

  const frames = Math.ceil(period / FRAME_MS)
  const color = currentScheme.color

  return new Promise(resolve => {
    const update = () => {
      const ratio = frame++ / frames
      const currentColor = tc.mix(color, '00000000', ratio * 100).toRgb()
      light(currentColor)

      if (frame > frames) {
        clearInterval(handle)
        return resolve()
      }
    }

    update()
    const handle = setInterval(update, FRAME_MS)
  })
}

function fadeIn (period) {
  console.log('DEBUG206')

  let frame = 0

  const frames = Math.ceil(period / FRAME_MS)
  const color = currentScheme.color

  return new Promise(resolve => {
    const update = () => {
      const ratio = frame++ / frames
      const currentColor = tc.mix('00000000', color, ratio * 100).toRgb()
      light(currentColor)

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

function dispatchPulseOn () {
  ledSm.dispatch('FIRE')
}

function dispatchPulseOff () {
  ledSm.dispatch('QUENCH')
}

function singlePulse (ledP, range, color) {
  console.log('DEBUG205: %s', color)

  return dispatchPulseOn()
  .then(() => fadeIn(PULSE_FADE_MS))
  .then(() => delay(PULSE_SOLID_MS))
  .then(() => fadeOut(PULSE_FADE_MS))
  .then(dispatchPulseOff)
}

function open () {
  return leds.open()
  .then(_lp => { lp = _lp })
}

function lightPulse () {
  console.log('DEBUG201')

  return open()
  .then(() => {
    effectHandle = setInterval(singlePulse, PULSE_DURATION_MS)
    singlePulse()
    return
  })
}

function lightSolid () {
  console.log('DEBUG300')

  return open()
  .then(() => {
    light(currentScheme.color)
    return
  })
}

function ledsOff () {
  light(COLORS.off)

  return leds.close(lp)
  .then(() => {
    lp = null
    currentScheme = null
    ledSm.dispatch('LEDS_COMPLETED')
  })
}

function pulseOff () {
  clearInterval(effectHandle)
  effectHandle = null
}

function lightUp (scheme) {
  if (_.isNil(currentScheme)) {
    currentScheme = scheme
  } else {
    pendingScheme = scheme
  }

  triggerScheme()
}

function lightDown () {
  ledSm.dispatch('LEDS_OFF')
}

function reset () {
  currentScheme = pendingScheme
  pendingScheme = null

  triggerScheme()
}

function triggerScheme () {
  console.log('DEBUG400: %j', {currentScheme, state: ledSm.state()})
  if (_.isNil(currentScheme)) return
  if (ledSm.state() !== 'off') return

  console.log('DEBUG401')

  const schemeType = currentScheme.type
  switch (schemeType) {
    case 'solid':
      return ledSm.dispatch('LIGHT_SOLID')
    case 'pusle':
      return ledSm.dispatch('LIGHT_PULSE')
    default:
      console.log(`Unsupported LED scheme: ${schemeType}`)
  }
}

