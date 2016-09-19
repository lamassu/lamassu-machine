var machina = require('machina')

// TODO: add context for phone screen, cancel buttons, get full send tx to work

var Flow = machina.Fsm.extend({
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
      },
      cancelPhoneNumber: function () {
        this.transition('restart')
      }
    },
    waitForSendCode: {
      _onEnter: function () {
        this.securityCode = null
        this.emit('screen', {screen: 'waiting'})
        this.emit('sendCode', {phone: this.phone})
      },
      badPhoneNumber: 'badPhoneNumber',
      networkError: 'networkError',
      requiredSecurityCode: function (code) {
        console.log('DEBUG15: %s', code)
        this.securityCode = code
        this.transition('waitForCode')
      }
    },
    waitForCode: {
      _onEnter: function () {
        this.emit('screen', {screen: 'securityCode'})
      },
      securityCode: function (code) {
        console.log('DEBUG12: %s, %s', code, this.securityCode)
        if (!code) {
          return this.transition('restart')
        }

        if (code === this.securityCode) {
          return this.transition('success')
        }

        this.transition('badSecurityCode')
      },
      cancelSecurityCode: function () {
        this.transition('restart')
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
        console.log('DEBUG11: %d', this.retries)

        this.retries += 1

        if (this.retries > 2) {
          console.log('DEBUG10')
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
  Flow: Flow
}
