var machina = require('machina')

// TODO: add timeouts

var smsFlow = new machina.Fsm({
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
        this.emit('screen', {screen: 'badPhoneNumber'})
      },
      badPhoneNumberOk: 'askForPhone'
    },
    badSecurityCode: {
      _onEnter: function () {
        this.emit('screen', {screen: 'badSecurityCode'})
      },
      badSecurityCodeOk: 'waitForSendCode'
    },
    networkError: {
      _onEnter: function () {
        this.emit('screen', {screen: 'networkError'})
      },
      networkErrorOk: function () {
        this.transition('restart')
      }
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
  }
})

module.exports = {
  smsFlow: smsFlow
}
