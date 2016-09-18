var machina = require('machina')

var smsFlow = new machina.Fsm({
  initialize: function (options) {
    this.context = options.context
  },

  namespace: 'smsFlow',
  initialState: 'initial',
  states: {
    initial: {
      'start': 'askForPhone'
    },
    askForPhone: {
      _onEnter: function () {
        this.emit('screen', {screen: 'registerPhone'})
      },
      phoneNumber: function (number) {
        if (!number) this.transition('restart')
        this.emit('sendCode', {phone: number})
        this.transition('waitForSendCode')
      }
    },
    waitForSendCode: {
      _onEnter: function () {
        this.emit('screen', {screen: 'waitForSendCode'})
      },
      badPhoneNumber: 'badPhoneNumber'

    },
    badPhoneNumber: {
      _onEnter: function () {
        this.emit('screen', {screen: 'badPhoneNumber'})
      },
      badPhoneNumberOk: 'askForPhone'
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
