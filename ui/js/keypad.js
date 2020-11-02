/* globals $, formatE164, libphonenumber */
var TIMEOUT = 120000
var LENGTHS = {
  phoneNumber: 15,
  code: 10,
  usSsn: 9
}

var Keypad = function (keypadId, opts, callback) {
  this.keypadId = keypadId
  this.keypad = $('#' + keypadId)
  this.result = ''
  this.count = 0
  this.type = opts.type
  this.opts = opts
  this.callback = callback
  this.timeoutRef = null
  var self = this

  function keyHandler (e) {
    self._restartTimeout()
    var target = $(e.target)
    if (target.hasClass('clear')) {
      return self.reset()
    }

    if (target.hasClass('enter')) {
      self.deactivate()

      const phoneResult = libphonenumber.parsePhoneNumberFromString(self.result, self.opts.country)
      const result = self.type === 'phoneNumber' && phoneResult ? phoneResult.number : self.result

      self.reset()
      return self.callback(result)
    }

    if (target.hasClass('backspace')) {
      return self.backspace()
    }

    if (target.hasClass('plus')) {
      return self._keyPress({ text: function () {
        return '+'
      } })
    }

    if (target.hasClass('key')) {
      return self._keyPress(target)
    }
  }

  this.keypad.get(0).addEventListener('mousedown', keyHandler)
}

Keypad.prototype._restartTimeout = function _restartTimeout () {
  var self = this

  clearTimeout(this.timeoutRef)
  this.timeoutRef = setTimeout(function () {
    self.reset()
    self.callback(null)
  }, TIMEOUT)
}

Keypad.prototype.activate = function activate () {
  this.reset()
  this._restartTimeout()
}

Keypad.prototype.deactivate = function deactivate () {
  clearTimeout(this.timeoutRef)
}

Keypad.prototype.setCountry = function setCountry (country) {
  if (country) this.opts.country = country
}

Keypad.prototype.reset = function reset () {
  this.keypad.find('.box').text('')
  this.count = 0
  this.result = ''
  this.keypad.find('.phone-separator').addClass('hidden')
  this.keypad.find('.enter')[0].disabled = true

  if (this.type === 'phoneNumber') {
    this.keypad.find('.backspace-plus').removeClass('backspace').addClass('plus').html('<img class="plus" src="images/plus.svg" />')
  }
}

Keypad.prototype.backspace = function backspace () {
  this.keypad.find('.box').text('')

  this.result = this.result.substring(0, this.result.length - 1)

  var display = getDisplay(this.result, this.type, this.opts.country)

  if (!display) {
    this.keypad.find('.phone-separator').addClass('hidden')
  }

  this.keypad.find('.box').text(display)

  if (this.type === 'phoneNumber' && !this.result) {
    this.keypad.find('.backspace-plus').removeClass('backspace').addClass('plus').html('<img class="plus" src="images/plus.svg" />')
  }

  if (!this.result) {
    this.keypad.find('.enter')[0].disabled = true
  }

  if (this.type === 'usSsn' && !isValidSsn(this.result)) {
    this.keypad.find('.enter')[0].disabled = true
  }
}

function ssnFormat (ssn) {
  if (ssn.length < 4) {
    return ssn
  }

  if ((ssn.length > 3) && (ssn.length < 6)) {
    return ssn.substr(0, 3) + '-' + ssn.substr(3)
  }

  if ((ssn.length > 5)) {
    return ssn.substr(0, 3) + '-' + ssn.substr(3, 2) + '-' + ssn.substr(5);
  }
}

function isValidSsn (ssn) {
  return ssn && 
    ssn.length === LENGTHS.usSsn && 
    ssn.substr(0, 1) !== '9' &&
    ssn.substr(0, 3) !== '000' &&
    ssn.substr(0, 3) !== '666' &&
    ssn.substr(3, 2) !== '00' &&
    ssn.substr(5) !== '0000'
}

function getDisplay (result, type, country) {
  if (!result) return result

  if (type === 'phoneNumber') return new libphonenumber.AsYouType(country).input(result)
  if (type === 'usSsn') return ssnFormat(result)

  return result
}

Keypad.prototype._keyPress = function _keyPress (target) {
  if (this.result.replace('+', '').length >= LENGTHS[this.type]) return
  var numeral = target.text()
  this.result += numeral

  var display = getDisplay(this.result, this.type, this.opts.country)

  if (display) {
    this.keypad.find('.phone-separator').removeClass('hidden')
  }

  this.keypad.find('.box').text(display)

  if (this.result.length > 0 && this.type === 'phoneNumber') {
    this.keypad.find('.backspace-plus').addClass('backspace').removeClass('plus').html('<img class="backspace" src="images/delete-keypad.svg" />')
  }

  if (this.result.length > 0 && this.result !== '+' && this.type !== 'usSsn') {
    this.keypad.find('.enter')[0].disabled = false
  }

  if (this.type === 'usSsn' && isValidSsn((this.result))) {
    this.keypad.find('.enter')[0].disabled = false
  }
}
