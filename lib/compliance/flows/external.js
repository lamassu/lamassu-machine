const actionEmitter = require('../../action-emitter')
const xstate = require('xstate')
const _ = require('lodash/fp')

const KEY = 'external'

const externalMachine = xstate.Machine({
  key: KEY,
  initial: 'idle',
  strict: true,
  states: {
    idle: {on: {START: 'askForExternal'}},
    askForExternal: {
      onEntry: ['askForExternal'],
      on: {
        FAILURE: 'failure'
      }
    },
    failure: { onEntry: ['failure'] },
  }
})

let trigger
let currentStateValue

function emitAction (action) {
  actionEmitter.emit('action', action, externalMachine)
}

const emitAllActions = _.forEach(emitAction)

function getTrigger () { return trigger }
function setTrigger (_trigger) { trigger = _trigger }

function start (model, trigger) {
  setTrigger(trigger)
  currentStateValue = externalMachine.initialState.value
  dispatch('START')
}

function dispatch (event) {
  const newState = externalMachine.transition(currentStateValue, event)
  currentStateValue = newState.value

  const actions = newState.actions
  if (!actions) { return }
  emitAllActions(actions)
}

externalMachine.dispatch = dispatch

module.exports = {
  start,
  dispatch,
  getTrigger
}

