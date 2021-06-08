/* globals $ */

const KEYBOARD_TIMEOUT = 30000
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
var Keyboard = function (options) {
  this.keyboardId = options.id
  this.keyboard = $('#' + options.id)
  this.inputBox = $(options.inputBox)
  this.keyCase = options.keyCase || 'lc'
  this.backspaceTimeout = options.backspaceTimeout || null
  this.active = options.active || true
  this.timeoutRef = options.timeoutRef || null
  this.constraint = options.constraint || null
  this.constraintButtons = []
}

Keyboard.prototype.init = function init (callback) {
  this.callback = callback ? callback : null
  var keyboard = document.getElementById(this.keyboardId)
  var self = this
  keyboard.addEventListener('mousedown', function (e) {
    self._restartTimeout()
    if (!self.active) return
    var target = $(e.target)
    if (target.hasClass('shift')) {
      self._toggleShift()
    } else if (target.hasClass('sym')) {
      self._toggleSym()
    } else if (target.hasClass('backspace')) {
      self._backspace(target)
    } else if (target.hasClass('key')) {
      self._keyPress(target)
    }
    self._validateInput()
  })

  if (this.keyboardId === 'wifi-keyboard') {
    this.keyboard.find('.entry .backspace').get(0).addEventListener('mouseup', function (e) {
      var target = $(e.target)
      self._backspaceUp(target)
    })
  }
  return this
}

Keyboard.prototype._restartTimeout = function _restartTimeout () {
  var self = this

  clearTimeout(this.timeoutRef)
  this.timeoutRef = setTimeout(function () {
    self.reset()
    self.callback && self.callback()
  }, KEYBOARD_TIMEOUT)
}

Keyboard.prototype.reset = function reset () {
  this.inputBox.data('content', '').val('')
}

Keyboard.prototype.activate = function activate () {
  this.active = true
  this.reset()
  this._restartTimeout()
}

Keyboard.prototype.deactivate = function deactivate () {
  this.active = false
  clearTimeout(this.timeoutRef)
}

Keyboard.prototype._toggleShift = function _toggleShift () {
  if (this.keyCase === 'lc') {
    this.keyCase = 'uc'
    this.keyboard.find('.keyboard-lc').hide()
    this.keyboard.find('.keyboard-uc').show()
  } else {
    this.keyCase = 'lc'
    this.keyboard.find('.keyboard-uc').hide()
    this.keyboard.find('.keyboard-lc').show()
  }
}

Keyboard.prototype._toggleSym = function _toggleSym () {
  if (this.keyboard.find('.keyboard-sym').is(':visible')) {
    this.keyboard.find('.keyboard-sym').hide()
    if (this.keyCase === 'lc') {
      this.keyboard.find('.keyboard-lc').show()
    } else {
      this.keyboard.find('.keyboard-uc').show()
    }
  } else {
    this.keyboard.find('.keyboard-lc').hide()
    this.keyboard.find('.keyboard-uc').hide()
    this.keyboard.find('.keyboard-sym').show()
  }
}

Keyboard.prototype._keyPress = function _keyPress (target) {
  var ascii_code = target.attr('data-ascii')
  if (ascii_code) {
    target.addClass('active')
    window.setTimeout(function () { target.removeClass('active') }, 500)
    var inputBox = this.inputBox
    var character = String.fromCharCode(ascii_code)
    // var displayCharacter = (ascii_code === 32) ? "␣" : character
    var content = inputBox.data('content') + character
    inputBox.data('content', content)
    inputBox.val(content)
    inputBox.caretToEnd()
  }
}

Keyboard.prototype._backspace = function _backspace (target) {
  if (this.keyboardId !== 'wifi-keyboard') {
    var inputBox = this.inputBox
    var content = inputBox.data('content')
    var result = content.substring(0, content.length - 1)
    inputBox.data('content', result)
    inputBox.val(result)
    inputBox.caretToEnd()

  } else {
    target.addClass('active')
    var inputBox = this.inputBox
    window.clearTimeout(this.backspaceTimeout)
    this.backspaceTimeout = window.setTimeout(function () {
      inputBox.data('content', '')
      inputBox.val('')
      inputBox.caretToEnd()
    }, 1000)
  }
}

Keyboard.prototype._backspaceUp = function _backspaceUp (target) {
  window.clearTimeout(this.backspaceTimeout)
  if (!target) return
  target.removeClass('active')

  var inputBox = this.inputBox
  var content = inputBox.data('content').slice(0, -1)
  inputBox.data('content', content)

  inputBox.val(content)
  inputBox.caretToEnd()
}

// Set caret position easily in jQuery
// Written by and Copyright of Luke Morton, 2011
// Licensed under MIT
(function ($) {
  // Behind the scenes method deals with browser
  // idiosyncrasies and such
  $.caretTo = function (el, index) {
    if (el.createTextRange) {
      var range = el.createTextRange()
      range.move('character', index)
      range.select()
    } else if (el.selectionStart !== null) {
      el.focus()
      el.setSelectionRange(index, index)
    }
  }

  // Another behind the scenes that collects the
  // current caret position for an element

  // TODO: Get working with Opera
  $.caretPos = function (el) {
    if ('selection' in document) {
      var range = el.createTextRange()
      try {
        range.setEndPoint('EndToStart', document.selection.createRange())
      } catch (e) {
        // Catch IE failure here, return 0 like
        // other browsers
        return 0
      }
      return range.text.length
    } else if (el.selectionStart !== null) {
      return el.selectionStart
    }
  }

  // The following methods are queued under fx for more
  // flexibility when combining with $.fn.delay() and
  // jQuery effects.

  // Set caret to a particular index
  $.fn.caret = function (index, offset) {
    if (typeof (index) === 'undefined') {
      return $.caretPos(this.get(0))
    }

    return this.queue(function (next) {
      if (isNaN(index)) {
        var i = $(this).val().indexOf(index)

        if (offset === true) {
          i += index.length
        } else if (typeof (offset) !== 'undefined') {
          i += offset
        }

        $.caretTo(this, i)
      } else {
        $.caretTo(this, index)
      }

      next()
    })
  }

  // Set caret to beginning of an element
  $.fn.caretToStart = function () {
    return this.caret(0)
  }

  // Set caret to the end of an element
  $.fn.caretToEnd = function () {
    return this.queue(function (next) {
      $.caretTo(this, $(this).val().length)
      next()
    })
  }
}(jQuery))

// pass the class or id of the new input box to put text into, include the . or # as well
Keyboard.prototype.setInputBox = function setInputBox(newInputBox, constraintButtons = []) {
  this.inputBox = $(newInputBox)
  if (!this.inputBox.data('content'))
    this.inputBox.data('content', '').val('')
  if (constraintButtons.length > 0) {
    this.constraintButtons = constraintButtons
  }
  this._validateInput()
}

Keyboard.prototype.setConstraint = function setConstraint(constraintType, constraintButtons = []) {
  this.constraint = constraintType
  this.constraintButtons = constraintButtons
  this._validateInput()
}

Keyboard.prototype._validateInput = function _validateInput() {
  switch(this.constraint) {
    case "spaceSeparation":
      this._validateSpaceSeparation()
      break
    case "none":
      this._validateNoConstraint()
      break
    case "email":
      this._validateEmail()
    default:
      break
  }
}

Keyboard.prototype._validateSpaceSeparation = function _validateSpaceSeparation() {
  // no spaces allowed inside field
  // minimum 1 character per field
  if (!!this.inputBox.data('content') && !this.inputBox.data('content').includes(' ')) {
    this.constraintButtons.forEach(buttonId => {
      $(buttonId).show()
    })
    return
  }
  this.constraintButtons.forEach(buttonId => {
    $(buttonId).hide()
  })
}

Keyboard.prototype._validateNoConstraint = function _validateSpaceSeparation() {
  // minimum 1 non space character
  if (!!this.inputBox.data('content') && !!this.inputBox.data('content').trim()) {
    this.constraintButtons.forEach(buttonId => {
      $(buttonId).show()
    })
    return
  }
  this.constraintButtons.forEach(buttonId => {
    $(buttonId).hide()
  })
}

Keyboard.prototype._validateEmail = function _validateEmail() {
  const content = this.inputBox.data('content') || ''
  if (emailRegex.test(content)) {
    this.constraintButtons.forEach(buttonId => {
      $(buttonId).show()
    })
    return
  }
  this.constraintButtons.forEach(buttonId => {
    $(buttonId).hide()
  })
}
