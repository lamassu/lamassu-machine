const xstate = require('xstate')
const _ = require('lodash/fp')

const actionEmitter = require('../action-emitter')

const KEY = 'idCardPhoto'

const idPhotoMachine = xstate.Machine({
  key: KEY,
  initial: 'idle',
  strict: true,
  states: {
    idle: {
      on: { START: 'scanPhotoCard' }
    },
    scanPhotoCard: {
      onEntry: ['timeoutToScannerCancel', 'transitionScreen', 'scanPhotoCard'],
      on: {
        SCANNED: {'authorizing': {actions: ['transitionScreen', 'authorizePhotoCardData']}},
        SCAN_ERROR: {'photoCardScanFailed': {actions: ['timeoutToFail', 'transitionScreen']}}
      }
    },
    authorizing: {
      on: {
        AUTHORIZED: 'success',
        BLOCKED_ID: {'photoCardVerificationFailed': {actions: ['timeoutToFail', 'transitionScreen']}}
      }
    },
    photoCardScanFailed: {on: {FAIL: 'failure'}},
    photoCardVerificationFailed: {on: {FAIL: 'failure'}},
    failure: { onEntry: ['failure'] },
    success: { onEntry: ['success'] }
  }
})

let currentStateValue
let data

function getData () { return data }
function setData (value) { data = value }

function getState () { return currentStateValue }

function start () {
  currentStateValue = idPhotoMachine.initialState.value
  data = null
  dispatch('START')
}

function emitAction (action) {
  actionEmitter.emit('action', action, idPhotoMachine)
}

const emitAllActions = _.forEach(emitAction)

function dispatch (event) {
  const newState = idPhotoMachine.transition(currentStateValue, event)
  currentStateValue = newState.value

  const actions = newState.actions
  if (!actions) { return }
  emitAllActions(actions)
}

idPhotoMachine.dispatch = dispatch

module.exports = {
  start,
  dispatch,
  getData,
  setData,
  getState
}
