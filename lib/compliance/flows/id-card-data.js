const xstate = require('xstate')
const _ = require('lodash/fp')

const actionEmitter = require('../../action-emitter')

const KEY = 'idCardData'

const idDataMachine = xstate.Machine({
  key: KEY,
  initial: 'idle',
  strict: true,
  states: {
    idle: { on: { START: 'scanId' } },
    scanId: {
      onEntry: ['timeoutToScannerCancel', 'transitionScreen', 'scanPDF'],
      on: {
        SCANNED: { 'authorizing': { actions: ['transitionScreen', 'authorizeIdCardData'] } },
        SCAN_ERROR: { 'idScanFailed': { actions: ['timeoutToFail', 'transitionScreen'] } },
        FAIL: 'failure'
      }
    },
    authorizing: {
      on: {
        AUTHORIZED: 'success',
        BLOCKED_ID: { 'idVerificationFailed': { actions: ['timeoutToFail', 'transitionScreen'] } }
      }
    },
    idScanFailed: { on: { FAIL: 'failure' } },
    idVerificationFailed: { on: { FAIL: 'failure' } },
    failure: { onEntry: ['failure'] },
    success: { onEntry: ['success'] }
  }
})

let currentStateValue
let data
let idCardDataStills = []

function getData () { return data }
function setData (value) { data = value }

function setIdDataPhotos (photo) {
  if (_.size(idCardDataStills) === 5) {
    idCardDataStills.shift()
    idCardDataStills.push(photo)
  } else idCardDataStills.push(photo)
}

function getIdDataPhotos () { return idCardDataStills }

function getState () { return currentStateValue }

function start () {
  currentStateValue = idDataMachine.initialState.value
  data = null
  dispatch('START')
}

function emitAction (action) {
  actionEmitter.emit('action', action, idDataMachine)
}

const emitAllActions = _.forEach(emitAction)

function dispatch (event) {
  const newState = idDataMachine.transition(currentStateValue, event)
  currentStateValue = newState.value

  const actions = newState.actions
  if (!actions) { return }
  emitAllActions(actions)
}

idDataMachine.dispatch = dispatch

module.exports = {
  start,
  dispatch,
  getData,
  setData,
  getState,
  setIdDataPhotos,
  getIdDataPhotos
}
