const machina = require('machina')

const { commands } = require('./consts')

const fsm = new machina.Fsm({
  initialState: 'START',
  states: {
    START: {
      '*': it => {
        transition(it.inputType)
      }
    },
    CONNECT: {
      _onEnter: () => {
        fsm.emit('command', commands.RESET)
      },
      _onExit: () => {
        fsm.emit('command', commands.GET_BILL_TABLE)
      },
      '*': it => {
        transition(it.inputType)
      }
    },
    POWER_UP: {
      '*': it => {
        transition(it.inputType)
      }
    },
    POWER_UP_WITH_BILL_IN_VALIDATOR: {
      '*': it => {
        transition(it.inputType)
      }
    },
    POWER_UP_WITH_BILL_IN_STACKER: {
      '*': it => {
        transition(it.inputType)
      }
    },
    INITIALIZE: {
      '*': it => {
        transition(it.inputType)
      }
    },
    IDLING: {
      '*': it => {
        transition(it.inputType)
      }
    },
    ACCEPTING: {
      _onEnter: () => fsm.emit('billAccepted'),
      ESCROW_POSITION: (data) => {
        fsm.emit('billRead', data)
        transition('ESCROW_POSITION')
      },
      '*': it => {
        transition(it.inputType)
      }
    },
    STACKING: {
      '*': it => {
        transition(it.inputType)
      }
    },
    RETURNING: {
      _onEnter: () => fsm.emit('billRejected'),
      '*': it => {
        transition(it.inputType)
      }
    },
    ESCROW_POSITION: {
      '*': it => {
        transition(it.inputType)
      }
    },
    BILL_STACKED: {
      _onEnter: () => fsm.emit('billValid'),
      '*': it => {
        transition(it.inputType)
      }
    },
    BILL_RETURNED: {
      '*': it => {
        transition(it.inputType)
      }
    },
    UNIT_DISABLED: {
      '*': it => {
        transition(it.inputType)
      }
    },
    HOLDING: {
      '*': it => {
        transition(it.inputType)
      }
    },
    DEVICE_BUSY: {
      '*': it => {
        transition(it.inputType)
      }
    },
    REJECTING: {
      '*': it => {
        transition(it.inputType)
      }
    },
    DROP_CASSETTE_FULL: {
      '*': it => {
        transition(it.inputType)
      }
    },
    DROP_CASSETTE_OUT_OF_POSITION: {
      _onEnter: () => fsm.emit('stackerOpen'),
      '*': it => {
        transition(it.inputType)
      }
    },
    VALIDATOR_JAMMED: {
      _onEnter: () => fsm.emit('jam'),
      '*': it => {
        transition(it.inputType)
      }
    },
    DROP_CASSETTE_JAMMED: {
      '*': it => {
        transition(it.inputType)
      }
    },
    CHEATED: {
      '*': it => {
        transition(it.inputType)
      }
    },
    PAUSE: {
      '*': it => {
        transition(it.inputType)
      }
    },
    FAILED: {
      '*': it => {
        transition(it.inputType)
      }
    }
  }
})

function transition (state) {
  if (fsm.state === state) return
  console.log(`CCNET: [${fsm.state} => ${state}]`)
  fsm.transition(state)
}

module.exports = fsm
