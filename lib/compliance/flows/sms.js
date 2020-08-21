const machina = require('machina')
const _ = require('lodash/fp')
const TIMEOUT_INTERVAL = 30000

// TODO: add context for phone screen, cancel buttons, get full send tx to work

var Flow = machina.Fsm.extend({
  namespace: 'smsFlow',
  initialState: 'initial',
  initialize: function (opts) {
    this.opts = opts
  },
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
        if (!number) return this.transition('fail')
        this.phone = number
        if (this.opts.noCode) return this.transition('success')
        this.transition('waitForSendCode')
      },
      cancelPhoneNumber: function () {
        this.transition('fail')
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
      networkDown: 'networkDown',
      requiredSecurityCode: function (code) {
        const waitMore = _.max([0, 500 - (Date.now() - this.waitStart)])
        setTimeout(() => {
          this.securityCode = code
          this.transition('waitForCode')
        }, waitMore)
      },
      timeout: 'fail'
    },
    waitForCode: {
      _onEnter: function () {
        this.emit('screen', {screen: 'securityCode'})
      },
      securityCode: function (code) {
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
      }
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

        this.retries += 1

        if (this.retries > 2) {
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
    networkDown: {
      _onEnter: function () {
        this.emit('screen', {screen: 'networkDown'})
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
    this.timer = setTimeout(function () { this.handle('timeout') }.bind(this), TIMEOUT_INTERVAL)
  },
  _clearTimer: function () { clearTimeout(this.timer) }
})

module.exports = {
  Flow: Flow
}
