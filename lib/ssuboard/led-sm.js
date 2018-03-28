const xstate = require('xstate')
const _ = require('lodash/fp')

const key = 'ledMachine'

const machine = xstate.Machine({
  key,
  initial: 'off',
  strict: true,
  states: {
    off: {
      on: {
        LIGHT_SOLID: {solid: {actions: ['lightSolid']}},
        LIGHT_PULSE: {pulseOn: {actions: ['lightPulse']}}
      }
    },
    solid: {
      on: {
        LEDS_OFF: {ledsWindDown: {actions: ['ledsOff']}}
      }
    },
    pulseOn: {
      on: {
        QUENCH: 'pulseOff',
        LEDS_OFF: {pulseWindDown: {actions: ['pulseOff']}}
      }
    },
    pulseOff: {
      on: {
        FIRE: 'pulseOn',
        LEDS_OFF: {ledsWindDown: {actions: ['pulseOff', 'ledsOff']}}
      }
    },
    pulseWindDown: {
      on: {
        QUENCH: {ledsWindDown: {actions: ['ledsOff']}}
      }
    },
    ledsWindDown: {
      on: {
        LEDS_COMPLETED: {off: {actions: ['reset']}}
      }
    }
  }
})

module.exports = {start, dispatch, state}

let currentState = machine.initialState
let actionMap = {}

function state () {
  return currentState.value
}

function start (_actionMap) {
  actionMap = _actionMap
  currentState = machine.initialState
}

function doAction (actionKey, event, state) {
  const action = actionMap[actionKey]
  if (action) { action(event) }
}

function dispatch (event) {
  currentState = machine.transition(currentState, event)
  _.forEach(action => doAction(action, event, currentState.value), currentState.actions)
}
