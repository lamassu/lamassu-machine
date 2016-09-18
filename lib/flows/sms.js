var machina = require('machina')

// TODO: add timeouts

var FsmExtend = machina.Fsm.extend

      //  green: {
      //       // _onEnter is a special handler that is invoked
      //       // immediately as the FSM transitions into the new state
      //       _onEnter: function() {
      //           this.timer = setTimeout( function() {
      //               this.handle( "timeout" );
      //           }.bind( this ), 30000 );
      //           this.emit( "vehicles", { status: "GREEN" } );
      //       },
      //       // If all you need to do is transition to a new state
      //       // inside an input handler, you can provide the string
      //       // name of the state in place of the input handler function.
      //       timeout: "green-interruptible",
      //       pedestrianWaiting: function() {
      //           this.deferUntilTransition( "green-interruptible" );
      //       },
      //       // _onExit is a special handler that is invoked just before
      //       // the FSM leaves the current state and transitions to another
      //       _onExit: function() {
      //           clearTimeout( this.timer );
      //       }
      //   },

var SmsFlow = new FsmExtend({
  initialize: function (options) {
    this.context = options.context
  },

  namespace: 'smsFlow',
  initialState: 'initial',
  states: {
    initial: {
      _onEnter: function () {
        this.phone = null
        this.securityCode = null
        this.retries = 0
      },
      'start': 'askForPhone'
    },
    askForPhone: {
      _onEnter: function () {
        this.phone = null
        this.emit('screen', {screen: 'registerPhone'})
      },
      phoneNumber: function (number) {
        if (!number) this.transition('restart')
        this.phone = number
        this.transition('waitForSendCode')
      }
    },
    waitForSendCode: {
      _onEnter: function () {
        this.securityCode = null
        this.emit('sendCode', {phone: this.phone})
        this.emit('screen', {screen: 'waitForSendCode'})
      },
      badPhoneNumber: 'badPhoneNumber',
      networkError: 'networkError',
      securityCode: function (code) {
        this.securityCode = code
        this.transition('waitForCode')
      }
    },
    waitForCode: {
      _onEnter: function () {
        this.emit('screen', {screen: 'registerCode'})
      },
      securityCode: function (code) {
        if (code === this.securityCode) {
          return this.transition('success')
        }
        this.transition('badSecurityCode')
      }
    },
    badPhoneNumber: {
      _onEnter: function () {
        this.phone = null
        this._setTimer()
        this.emit('screen', {screen: 'badPhoneNumber'})
      },
      badPhoneNumberOk: 'askForPhone',
      timeout: 'restart',
      _onExit: this._clearTimer

    },
    badSecurityCode: {
      _onEnter: function () {
        this._setTimer()
        this.retries += 1
        if (this.retries > 3) {
          return this.transition('maxPhoneRetries')
        }
        this.emit('screen', {screen: 'badSecurityCode'})
      },
      badSecurityCodeOk: 'waitForSendCode',
      timeout: 'restart',
      _onExit: this._clearTimer
    },
    maxPhoneRetries: {
      _onEnter: function () {
        this._setTimer()
        this.emit('screen', {screen: 'maxPhoneRetries'})
      },
      maxPhoneRetriesOk: 'restart',
      timeout: 'restart',
      _onExit: this._clearTimer
    },
    networkError: {
      _onEnter: function () {
        this._setTimer()
        this.emit('screen', {screen: 'networkError'})
      },
      networkErrorOk: function () {
        this.transition('restart')
      },
      timeout: 'restart',
      _onExit: this._clearTimer
    },
    success: {
      _onEnter: function () {
        this.emit('success')
        this.transition('initial')
      }
    },
    restart: {
      _onEnter: function () {
        this.emit('idle')
        this.transition('initial')
      }
    }
  },
  _setTimer: function () {
    this.timer = setTimeout(function () { this.handle('timeout') }.bind(this), 30000)
  },
  _clearTimer: function () { clearTimeout(this.timer) }
})

module.exports = {
  SmsFlow: SmsFlow
}
