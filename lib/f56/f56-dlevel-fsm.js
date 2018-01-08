'use strict'

const machina = require('machina')

const RESPONSE_TIMEOUT = 20000

const fsm = new machina.Fsm({
  initialState: 'Idle',
  states: {
    Idle: {
      waitForResponse: 'WaitForStatus'
    },
    WaitForStatus: {
      _onEnter: startTimer,
      timeout: conclude('Transmission Timeout'),
      transmissionError: conclude('TransmissionError'),
      transmissionComplete: 'WaitForResponse',
      _onExit: clearTimer
    },
    WaitForResponse: {
      _onEnter: startTimer,
      timeout: conclude('Response Timeout'),
      frame: conclude('Response'),
      _onExit: clearTimer
    }
  }
})

function startTimer () {
  fsm.timerId = setTimeout(() => fsm.handle('timeout'), RESPONSE_TIMEOUT)
}

function clearTimer () {
  clearTimeout(fsm.timerId)
}

function conclude (status) {
  return function (data) {
    fsm.emit('status', status, data)
    fsm.transition('Idle')
  }
}

module.exports = fsm
