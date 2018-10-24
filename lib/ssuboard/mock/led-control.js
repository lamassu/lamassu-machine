const _ = require('lodash/fp')

// const BezierEasing = require('bezier-easing')
const tc = require('tinycolor2')

const ledSm = require('../led-sm')

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

const COLOR_LOOKUP = _.invert(COLORS)

const LEDS = {
  scanBayLeds: [0, 15],
  validatorLeds: [16, 20],
  dispenserLeds: [21, 25],
  doorLeds: [16, 25],
  allLeds: [0, 25]
}

const LEDS_LOOKUP = _.invert(LEDS)

const PULSE_FADE_MS = 300
const PULSE_SOLID_MS = 200
const PULSE_DURATION_MS = 1100

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

function light (color) {
  const leds = LEDS_LOOKUP[currentScheme.range]
  console.log(`[MOCK] light ${leds}: ${COLOR_LOOKUP[color]}`)
  return Promise.resolve()
}

function fadeOut (period) {
  const leds = LEDS_LOOKUP[currentScheme.range]
  const color = currentScheme.color
  console.log(`[MOCK] fadeOut ${leds}: ${COLOR_LOOKUP[color]}`)
  return Promise.resolve()
}

function fadeIn (period) {
  const leds = LEDS_LOOKUP[currentScheme.range]
  const color = currentScheme.color
  console.log(`[MOCK] fadeIn ${leds}: ${COLOR_LOOKUP[color]}`)
  return Promise.resolve()
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

function lightPulse () {
  effectHandle = setInterval(singlePulse, PULSE_DURATION_MS)
  singlePulse()
  return
}

function lightSolid () {
  return fadeIn(PULSE_FADE_MS)
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
  ? fadeOut(PULSE_FADE_MS).then(() => light(tc(COLORS.off)))
  : Promise.resolve(light(tc(COLORS.off)))

  return promise
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
}

function lightDown () {
  ledSm.dispatch('LEDS_OFF')
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
