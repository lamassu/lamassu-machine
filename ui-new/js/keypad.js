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

    if (target.hasClass('backspace')) {
      return self.backspace()
    }

    if (target.hasClass('plus')) {
      return self._keyPress({ text: () => '+' })
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
    this.keypad.find('.backspace-plus').removeClass('backspace').addClass('plus').text('+')
  }
}

Keypad.prototype.backspace = function backspace () {
  this.keypad.find('.box').text('')

  this.result = this.result.substring(0, this.result.length - 1)

  var display = this.type === 'phoneNumber'
    ? formatInternational(this.opts.country, this.result)
    : this.result

  this.keypad.find('.box').text(display)

  if (this.type === 'phoneNumber' && !this.result) {
    this.keypad.find('.backspace-plus').removeClass('backspace').addClass('plus').text('+')
  }
}

Keypad.prototype._keyPress = function _keyPress (target) {
  if (this.result.replace('+', '').length >= LENGTHS[this.type]) return
  var numeral = target.text()
  this.result += numeral
  var display = this.type === 'phoneNumber' && this.result
    ? formatInternational(this.opts.country, this.result)
    : this.result

  this.keypad.find('.box').text(display)

  if (this.result.length > 0 && this.type === 'phoneNumber') {
    this.keypad.find('.backspace-plus').addClass('backspace').removeClass('plus').html(`
      <svg xmlns="http://www.w3.org/2000/svg" width="24" height="19" viewBox="0 0 24 19">
        <path fill="#ffffff" d="M7.33837785,1.09195382 C7.92101541,0.451772035 8.91032779,0 9.73473749,0 L20.9790109,0 C22.6494088,0 24,1.48569579 24,3.32510087 L24,15.6748991 C24,17.5099563 22.6471755,19 20.9790109,19 L9.73473749,19 C8.91412272,19 7.91733515,18.5441842 7.33837785,17.9080462 L0.224201196,10.0912375 C-0.0729792094,9.76470604 -0.0764831205,9.23914394 0.224201196,8.90876252 L7.33837785,1.09195382 Z M1.51118651,9.5 L8.19529956,16.7945307 C8.52758219,17.1571586 9.18908168,17.4594595 9.66338102,17.4594595 L20.8223408,17.4594595 C21.7658034,17.4594595 22.5333383,16.6209276 22.5333383,15.586546 L22.5333383,3.41345396 C22.5333383,2.37399746 21.7672986,1.54054054 20.8223408,1.54054054 L9.66338102,1.54054054 C9.18610027,1.54054054 8.53179922,1.8382393 8.19529956,2.20546934 L1.51118651,9.5 Z M14.630579,8.19399379 L17.5377295,5.29630446 C17.8419652,4.99305883 18.3323769,4.99021622 18.6378181,5.29466333 C18.9411445,5.59700259 18.9383933,6.08993356 18.6361716,6.39117176 L15.7290211,9.2888611 L18.6361716,12.1865504 C18.9404073,12.4897961 18.9432592,12.9786117 18.6378181,13.2830589 C18.3344917,13.5853981 17.8399512,13.5826559 17.5377295,13.2814177 L14.630579,10.3837284 L11.7234285,13.2814177 C11.4191927,13.5846634 10.928781,13.587506 10.6233399,13.2830589 C10.3200134,12.9807196 10.3227646,12.4877886 10.6249863,12.1865504 L13.5321368,9.2888611 L10.6249863,6.39117176 C10.3207506,6.08792613 10.3178987,5.59911044 10.6233399,5.29466333 C10.9266663,4.99232407 11.4212067,4.99506626 11.7234285,5.29630446 L14.630579,8.19399379 Z"/>
      </svg>
    `)
  }
}
