'use strict';

var Keypad = function(keypadId) {
  this.keypadId = keypadId;
  this.keypad = $('#' + keypadId);
  this.result = null;
  this.count = 0;
};

Keypad.prototype.read = function read(cb) {
  var keypad = document.getElementById(this.keypadId);
  var self = this;

  this.reset();
  function keyHandler(e) {
    var target = $(e.target);
    if (target.hasClass('clear')) {
      return self.reset();
    } 

    if (target.hasClass('enter')) {
      if (self.count !== 4) return;
      return cb(self.result);
    }

    if (target.hasClass('key')) {
      return self._keyPress(target);
    }    
  }

  keypad.addEventListener('mousedown', keyHandler);
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
  this.keypad.find('.box-' + this.count).text(numeral);
  this.result = this.result || 0;
  this.result *= 10;
  this.result += parseInt(numeral);
};
