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
// const PULSE_QUIET_MS = PULSE_DURATION_MS - (PULSE_SOLID_MS + PULSE_FADE_MS * 2)

const FRAME_MS = 30 // milliseconds per frame

const LED_BANK = _.range(0, LED_COUNT)

// Pulse amazonite when waiting for bill
// Pulse orange while processing bill

// Pulse orange while dispensing, pulse amazonite when ready to take

// Door: pulse both indicators blue before opening door
// Both indicators solid while open

// Scan bay: fade into white; on succesful scan fade out

module.exports = {lightUp, lightDown, timedPulse, LEDS, COLORS}

const actionMap = {
  lightSolid,
  lightPulse,
  pulseOff,
  ledsOff,
  reset
}

ledSm.start(actionMap)

function setLeds (range, color) {
  const ledOff = ledValues(tc(COLORS.off).toRgb())
  const ledColor = ledValues(color.toRgb())

  const arr = _.map(i =>
    _.inRange(range[0], range[1] + 1, i)
    ? ledColor
    : ledOff,
    LED_BANK)

  return _.flatten(arr)
}

function ledValues (rgb) {
  return [0xe0 | Math.round(rgb.a * 31), rgb.b, rgb.g, rgb.r]
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
      const currentColor = tc.mix(color, '00000000', ratio * 100)
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
  let frame = 0

  const frames = Math.ceil(period / FRAME_MS)
  const color = currentScheme.color

  return new Promise(resolve => {
    const update = () => {
      const ratio = frame++ / frames
      const currentColor = tc.mix('00000000', color, ratio * 100)
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
  return Promise.resolve()
}

function dispatchPulseOff () {
  ledSm.dispatch('QUENCH')
  return Promise.resolve()
}

function singlePulse (ledP, range, color) {
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
  return open()
  .then(() => {
    effectHandle = setInterval(singlePulse, PULSE_DURATION_MS)
    singlePulse()
    return
  })
}

function lightSolid () {
  return open()
  // .then(() => fadeIn(PULSE_FADE_MS))
  .then(() => light(tc(currentScheme.color)))
}

function ledsOff () {
  if (_.isNil(currentScheme)) {
    console.log('Attempted to turn off LEDs that were already off.')
    return
  }

  if (_.isNil(lp)) {
    console.log('Attempted to turn off LEDs that were already off [no pointer]')
    return
  }

  console.log('DEBUG600: %j', currentScheme)

  const promise = currentScheme.type === 'solid'
  // ? fadeOut(PULSE_FADE_MS).then(() => light(tc(COLORS.off)))
  ? Promise.resolve(light(tc(COLORS.off)))
  : Promise.resolve(light(tc(COLORS.off)))

  return promise
  .then(() => leds.close(lp))
  .then(() => {
    lp = null
    console.log('DEBUG800')
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
    console.log('DEBUG801')
    currentScheme = scheme
  } else {
    pendingScheme = scheme
  }

  triggerScheme()
  return Promise.resolve()
}

function lightDown () {
  ledSm.dispatch('LEDS_OFF')
  return Promise.resolve()
}

function reset () {
  console.log('DEBUG803')
  currentScheme = pendingScheme
  pendingScheme = null

  triggerScheme()
}

function triggerScheme () {
  if (_.isNil(currentScheme)) return
  if (ledSm.state() !== 'off') return

  const schemeType = currentScheme.type
  switch (schemeType) {
    case 'solid':
      return ledSm.dispatch('LIGHT_SOLID')
    case 'pulse':
      return ledSm.dispatch('LIGHT_PULSE')
    default:
      console.log(`Unsupported LED scheme: ${schemeType}`)
  }
}

function timedPulse (range, color, pulseTime) {
  console.log('DEBUG671')
  return new Promise(resolve => {
    setTimeout(() => {
      lightDown()
      resolve()
    }, pulseTime)

    lightUp({range, color, type: 'pulse'})
  })
}
