const xstate = require('xstate')
const _ = require('lodash/fp')

const actionEmitter = require('../action-emitter')

const KEY = 'facephoto'

const facephotoMachine = xstate.Machine({
  key: KEY,
  initial: 'idle',
  strict: true,
  states: {
    idle: { on: { START: 'takeFacephoto' } },
    takeFacephoto: {
      onEntry: ['timeoutToScannerCancel', 'transitionScreen', 'takeFacephoto'],
      on: {
        PHOTO_TAKEN: { 'authorizing': { actions: ['transitionScreen', 'authorizeFacephotoData'] } },
        SCAN_ERROR: { 'facephotoFailed': { actions: ['timeoutToFail', 'transitionScreen'] } }
      }
    },
    retryTakeFacephoto: {
      onEntry: ['timeoutToScannerCancel', 'transitionScreen', 'retryTakeFacephoto'],
      on: {
        PHOTO_TAKEN: { 'authorizing': { actions: ['transitionScreen', 'authorizeFacephotoData'] } },
        SCAN_ERROR: { 'facephotoFailed': { actions: ['timeoutToFail', 'transitionScreen'] } }
      }
    },
    authorizing: {
      on: {
        AUTHORIZED: 'success',
        BLOCKED_ID: { 'facephotoVerificationFailed': { actions: ['timeoutToFail', 'transitionScreen'] } }
      }
    },
    facephotoFailed: {
      on: {
        FAIL: 'failure',
        RETRY: 'retryTakeFacephoto'
      }
    },
    facephotoVerificationFailed: { on: { FAIL: 'failure' } },
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
  currentStateValue = facephotoMachine.initialState.value
  data = null
  dispatch('START')
}

function emitAction (action) {
  actionEmitter.emit('action', action, facephotoMachine)
}

const emitAllActions = _.forEach(emitAction)

function dispatch (event) {
  const newState = facephotoMachine.transition(currentStateValue, event)
  currentStateValue = newState.value

  const actions = newState.actions
  if (!actions) { return }
  emitAllActions(actions)
}

facephotoMachine.dispatch = dispatch

module.exports = {
  start,
  dispatch,
  getData,
  setData,
  getState
}
