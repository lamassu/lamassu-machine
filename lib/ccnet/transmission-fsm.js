const machina = require('machina')
const _ = require('lodash/fp')

const Crc = require('../id003/crc')
const { ADDRESS, commands, responses } = require('./consts')

const respMap = _.invert(responses)

const RESPONSE_TIMEOUT = 5000
const R_POLL = 20

const fsm = new machina.Fsm({
  initialState: 'Idle',
  states: {
    Idle: {
      waitForResponse: () => {
        fsm.transition('WaitForResponse')
      }
    },
    WaitForResponse: {
      _onEnter: startTimer,
      timeout: conclude('Response Timeout'),
      frame: response => {
        fsm.response = response
        fsm.transition('CheckCrc')
      },
      _onExit: clearTimer
    },
    CheckCrc: {
      _onEnter: () => {
        const payloadCrc = fsm.response.readUInt16LE(fsm.response.length - 2)
        if (Crc.compute(fsm.response.slice(0, -2)) !== payloadCrc) {
          send(commands.NAK)
          return conclude('CRCError')(fsm.response)
        }

        fsm.transition('HandleResponse')
      }
    },
    HandleResponse: {
      _onEnter: () => {
        const response = fsm.response
        const address = response[1]
        const payload = getPayload(response)
        const command = payload[0]
        const commandName = respMap[command]

        if (!commandName) {
          return conclude('unknownCommand')(commandName)
        }

        if (address !== ADDRESS) {
          return conclude('wrongSourceAddress')(address)
        }

        if (response.length === 6 && command === responses.NAK) {
          return conclude('nak')()
        }

        if (response.length === 6 && command === responses.ACK) {
          return conclude('ack')()
        }

        send(commands.ACK)

        if (command === responses.ILLEGAL_COMMAND) {
          return conclude('illegalCommand')
        }

        setTimeout(() => conclude('Response')(payload), R_POLL)
      }
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
    fsm.transition('Idle')
    fsm.emit('status', status, data)
  }
}

function send (data) {
  fsm.emit('send', data)
}

function getPayload (data) {
  return data.slice(3, -2)
}

module.exports = fsm
