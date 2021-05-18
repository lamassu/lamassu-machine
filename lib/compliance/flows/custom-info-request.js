const _ = require('lodash/fp')
const xstate = require('xstate')

const actionEmitter = require('../../action-emitter')

const variables = {}

const idDataMachine = xstate.Machine({
  key: 'customInfoRequest',
  initial: 'idle',
  strict: true,
  states: {
    idle: { on: { START: 'customInfoRequestScreen2' } },
    customInfoRequestScreen2: {
      onEntry: ['transitionScreen'],
      on: {
        SEND: {
          'saveData': {
            actions: ['transitionScreen', 'saveCustomInfoRequestData']
          }
        }
      }
    },
    saveData: {
      on: {
        SUCCESS: 'success',
        FAILURE: 'failure'
      }
    },
    failure: { onEntry: ['failure'] },
    success: { onEntry: ['success'] }
  }
})

function setData (data) {
  variables.data = data
}

const getData = () => variables.data

const getState = () => variables.currentStateValue

const emitAction = (action) => actionEmitter.emit('action', action, idDataMachine)

const emitAllActions = _.forEach(emitAction)

const dispatch = (event) => {
  const newState = idDataMachine.transition(variables.currentStateValue, event)
  variables.currentStateValue = newState.value

  const actions = newState.actions
  if (!actions) { return }
  emitAllActions(actions)
}

const start = (model, trigger) => {
  variables.currentStateValue = idDataMachine.initialState.value
  variables.model = model
  variables.trigger = trigger
  variables.data = null
  dispatch('START')
}

module.exports = {
  start,
  getState,
  setData,
  getData,
  dispatch
}
