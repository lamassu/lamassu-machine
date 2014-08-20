'use strict';

var TIMEOUT = 60000;

var Keypad = function(keypadId, callback) {
  this.keypadId = keypadId;
  this.keypad = $('#' + keypadId);
  this.result = null;
  this.count = 0;
  this.callback = callback;
  this.timeoutRef = null;
  var self = this;

  function keyHandler(e) {
    self._restartTimeout();
    var target = $(e.target);
    if (target.hasClass('clear')) {
      return self.reset();
    }

    if (target.hasClass('enter')) {
      if (self.count !== 4) return;
      self.deactivate();
      return self.callback(self.result);
    }

    if (target.hasClass('key')) {
      return self._keyPress(target);
    }
  }

  this.keypad.get(0).addEventListener('mousedown', keyHandler);
};

Keypad.prototype._restartTimeout = function _restartTimeout() {
  var self = this;

  clearTimeout(this.timeoutRef);
  this.timeoutRef = setTimeout(function() {
    self.reset();
    self.callback(null);
  }, TIMEOUT);
};

Keypad.prototype.activate = function activate() {
  this.reset();
  this._restartTimeout();
};

Keypad.prototype.deactivate = function deactivate() {
  clearTimeout(this.timeoutRef);
};

Keypad.prototype.reset = function reset() {
  this.keypad.find('.box').text('');
  this.count = 0;
  this.result = null;
};

Keypad.prototype._keyPress = function _keyPress(target) {
  if (this.count > 3) return;
  var numeral = target.text();
  this.count += 1;
  this.keypad.find('.box-' + this.count).text('•');
  this.result = this.result || 0;
  this.result *= 10;
  this.result += parseInt(numeral);
};
