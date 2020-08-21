const xstate = require('xstate')
const _ = require('lodash/fp')

const actionEmitter = require('../../action-emitter')

const KEY = 'sanctions'

const sanctionsMachine = xstate.Machine({
  key: KEY,
  initial: 'idle',
  strict: true,
  states: {
    idle: { on: { START: 'triggerSanctions' } },
    triggerSanctions: {
      onEntry: ['transitionScreen', 'triggerSanctions'],
      on: {
        SUCCESS: 'success',
        FAILURE: 'failure'
      }
    },
    failure: { onEntry: ['sanctionsFailure'] },
    success: { onEntry: ['success'] }
  }
})

let currentStateValue

function getState () { return currentStateValue }

function start () {
  currentStateValue = sanctionsMachine.initialState.value
  dispatch('START')
}

function emitAction (action) {
  actionEmitter.emit('action', action, sanctionsMachine)
}

const emitAllActions = _.forEach(emitAction)

function dispatch (event) {
  const newState = sanctionsMachine.transition(currentStateValue, event)
  currentStateValue = newState.value

  const actions = newState.actions
  if (!actions) { return }
  emitAllActions(actions)
}

sanctionsMachine.dispatch = dispatch

module.exports = {
  start,
  dispatch,
  getState
}
