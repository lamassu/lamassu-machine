const machina = require('machina')
const _ = require('lodash/fp')

// TODO: add context for phone screen, cancel buttons, get full send tx to work

var Flow = machina.Fsm.extend({
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
        this._setTimer()
        this.phone = null
        this.emit('screen', {screen: 'registerPhone'})
      },
      phoneNumber: function (number) {
        if (!number) return this.transition('fail')
        this.phone = number
        this.transition('waitForSendCode')
      },
      cancelPhoneNumber: function () {
        this.transition('fail')
      },
      timeout: 'fail',
      _onExit: function () {
        this._clearTimer()
      }
    },
    waitForSendCode: {
      _onEnter: function () {
        this.securityCode = null
        this.emit('screen', {screen: 'waiting'})
        this.emit('sendCode', {phone: this.phone})
        this.waitStart = Date.now()
      },
      badPhoneNumber: 'badPhoneNumber',
      networkError: 'networkError',
      requiredSecurityCode: function (code) {
        const waitMore = _.max([0, 500 - (Date.now() - this.waitStart)])
        setTimeout(() => {
          this.securityCode = code
          this.transition('waitForCode')
        }, waitMore)
      }
    },
    waitForCode: {
      _onEnter: function () {
        this._setTimer()
        this.emit('screen', {screen: 'securityCode'})
      },
      securityCode: function (code) {
        console.log('DEBUG12: %s, %s', code, this.securityCode)
        if (!code) {
          return this.transition('fail')
        }

        if (code === this.securityCode) {
          return this.transition('success')
        }

        this.transition('badSecurityCode')
      },
      cancelSecurityCode: function () {
        this.transition('fail')
      },
      _onExit: function () {
        this._clearTimer()
      },
      timeout: 'fail'
    },
    badPhoneNumber: {
      _onEnter: function () {
        this._setTimer()
        this.phone = null
        this.emit('screen', {screen: 'badPhoneNumber'})
      },
      badPhoneNumberOk: 'askForPhone',
      timeout: 'fail',
      _onExit: function () {
        this._clearTimer()
      }
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
      timeout: 'fail',
      _onExit: function () {
        this._clearTimer()
      }
    },
    maxPhoneRetries: {
      _onEnter: function () {
        this._setTimer()
        this.emit('screen', {screen: 'maxPhoneRetries'})
      },
      maxPhoneRetriesOk: 'fail',
      timeout: 'fail',
      _onExit: function () {
        this._clearTimer()
      }
    },
    networkError: {
      _onEnter: function () {
        this._setTimer()
        this.emit('screen', {screen: 'networkError'})
      },
      networkErrorOk: 'fail',
      timeout: 'fail',
      _onExit: function () {
        this._clearTimer()
      }
    },
    success: {
      _onEnter: function () {
        this.emit('success')
        this.transition('initial')
      }
    },
    fail: {
      _onEnter: function () {
        this.phone = null
        this.securityCode = null
        this.retries = 0
        this.emit('fail')
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
    this.timer = setTimeout(function () { this.handle('timeout') }.bind(this), 5000)
  },
  _clearTimer: function () { clearTimeout(this.timer) }
})

module.exports = {
  Flow: Flow
}
