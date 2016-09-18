/* globals $, formatE164, formatInternational */
var TIMEOUT = 120000
var LENGTHS = {
  phoneNumber: 15,
  code: 10
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
      var result = self.type === 'phoneNumber'
      ? formatE164(self.opts.country, self.result)
      : self.result
      self.reset()
      return self.callback(result)
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
  if (this.type === 'phoneNumber') {
    this.keypad.find('.enter-plus').removeClass('enter').addClass('plus').text('+')
  }
}

Keypad.prototype._keyPress = function _keyPress (target) {
  if (this.result.replace('+', '').length >= LENGTHS[this.type]) return
  if (this.result.length > 0 && this.type === 'phoneNumber') {
    this.keypad.find('.enter-plus').addClass('enter').removeClass('plus').text('Enter')
  }
  var numeral = target.text()
  this.result += numeral
  var display = this.type === 'phoneNumber'
  ? formatInternational(this.opts.country, this.result)
  : this.result

  this.keypad.find('.box').text(display)
}
