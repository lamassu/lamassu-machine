/* globals $ */
var Keyboard = function (keyboardId) {
  this.keyboardId = keyboardId
  this.keyboard = $('#' + keyboardId)
  this.inputBox = this.keyboard.find('input.passphrase')
  this.keyCase = 'lc'
  this.backspaceTimeout = null
  this.active = true
}

Keyboard.prototype.init = function init () {
  var keyboard = document.getElementById(this.keyboardId)
  var self = this
  keyboard.addEventListener('mousedown', function (e) {
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
  })

  this.keyboard.find('.entry .backspace').get(0).addEventListener('mouseup', function (e) {
    var target = $(e.target)
    self._backspaceUp(target)
  })

  return this
}

Keyboard.prototype.reset = function reset () {
  this.inputBox.data('content', '').val('')
}

Keyboard.prototype.activate = function activate () {
  this.active = true
}

Keyboard.prototype.deactivate = function deactivate () {
  this.active = false
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
  target.addClass('active')
  var inputBox = this.inputBox
  window.clearTimeout(this.backspaceTimeout)
  this.backspaceTimeout = window.setTimeout(function () {
    inputBox.data('content', '')
    inputBox.val('')
    inputBox.caretToEnd()
  }, 1000)
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
