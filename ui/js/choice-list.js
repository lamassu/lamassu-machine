'use strict';

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) { arr2[i] = arr[i]; } return arr2; } else { return Array.from(arr); } }

/* globals $ */

var ChoiceList = function ChoiceList(options) {
  this.choiceListId = options.id;
  this.choiceList = $('#' + options.id);
  this.selectedChoices = [];
  this.choices = [];
  this.currentPage = 0;
  this.active = options.active || true;
  this.choiceType = 'single'; // default
  this.setComplianceTimeout = options.setComplianceTimeout;
};

function forEach(iter, proc) {
  for (var i = 0; i < iter.length; i++) {
    proc(iter[i]);
  }
}

ChoiceList.prototype.init = function init(cb) {
  this.callback = cb;

  var self = this;
  var proc = function proc(button) {
    return button.addEventListener('mousedown', function (e) {
      return self._buttonClickEventListener(self, e);
    });
  };
  var buttons = document.querySelector('#' + this.choiceListId).querySelectorAll('.choice-list-button');
  if (buttons.forEach) buttons.forEach(proc);else forEach(buttons, proc);
  return this;
};

ChoiceList.prototype._buttonClickEventListener = function _buttonClickEventListener(self, e) {
  if (!self.active) return;
  setComplianceTimeout();
  var target = $(e.target);
  if (target.hasClass('submit-choice-list-button')) {
    // do not submit if at least one choice is not selected
    if (self.selectedChoices.length === 0) return;
    return self.callback(self.selectedChoices);
  }
  if (target.hasClass('choice-list-arrow-up')) {
    if (self.currentPage === 0) return;
    self.currentPage -= 1;
    self._setupPager(self.currentPage);
    return self._setupChoices(self.currentPage);
  }
  if (target.hasClass('choice-list-arrow-down')) {
    if (self.currentPage === this.choices.length - 1) return;
    self.currentPage += 1;
    self._setupPager(self.currentPage);
    return self._setupChoices(self.currentPage);
  }
  if (target.hasClass('choice-list-item')) {
    // if it's not a selectMultiple (choose multiple options) type of choice list,
    // then deselect the previous choice before selecting the new one
    if (self.choiceType !== 'selectMultiple') self._deselectChoices();
    self._toggleChoice(target[0].innerText);
  }
};

ChoiceList.prototype.replaceChoices = function (availableChoices) {
  var choiceType = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : 'single';

  this.reset();
  this.choiceType = choiceType;
  var _choices = [].concat(_toConsumableArray(availableChoices));
  this.choices = [];
  while (_choices.length > 0) {
    this.choices.push(_choices.splice(0, 4));
  }
  this._setupPager(this.currentPage);
  this._setupChoices(this.currentPage);
};

ChoiceList.prototype._setupPager = function _setupPager(targetPage) {
  if (this.choices.length == 1) this.choiceList.find('.choice-list-arrows-wrapper').hide();else this.choiceList.find('.choice-list-arrows-wrapper').show();

  if (targetPage === 0) this.choiceList.find('.choice-list-arrow-up').prop('disabled', true);else this.choiceList.find('.choice-list-arrow-up').prop('disabled', false);

  if (targetPage === this.choices.length - 1) this.choiceList.find('.choice-list-arrow-down').prop('disabled', true);else this.choiceList.find('.choice-list-arrow-down').prop('disabled', false);

  this.choiceList.find('.choice-list-pager').text(targetPage + 1 + '/' + this.choices.length);
};

ChoiceList.prototype._setupChoices = function _setupChoices(page) {
  var choices = this.choices[page];
  var choiceButtons = this.choiceList.find('.choice-list-grid-wrapper')[0].children;
  var radio = '<div class="choice-list-radio"><div></div></div>';
  for (var i = 0; i < choiceButtons.length; i++) {
    var button = $(choiceButtons[i]);
    button.removeClass('choice-selected');
    if (choices[i]) {
      if (this.selectedChoices.includes(choices[i])) button.addClass('choice-selected');
      button.show();
      button.html(radio).append($('<div></div>').text(choices[i]));
      continue;
    }
    button.hide();
  }
};

ChoiceList.prototype._toggleChoice = function _toggleChoice(choice) {
  var choiceIndex = this.selectedChoices.indexOf(choice);
  if (choiceIndex > -1) {
    this.selectedChoices.splice(choiceIndex, 1);
    this._toggleButton(choice);
    return;
  }
  this.selectedChoices.push(choice);
  this._toggleButton(choice);
};

ChoiceList.prototype._toggleButton = function _toggleButton(choice) {
  var choiceButtons = this.choiceList.find('.choice-list-grid-wrapper')[0].children;
  for (var i = 0; i < choiceButtons.length; i++) {
    var button = $(choiceButtons[i]);
    if (button[0].innerText === choice) {
      button.toggleClass('choice-selected');
      break;
    }
  }
  // check if should enable/disable submit button
  this.selectedChoices.length === 0 ? this.choiceList.find('.submit-choice-list-button')[0].disabled = true : this.choiceList.find('.submit-choice-list-button')[0].disabled = false;
};

ChoiceList.prototype.deactivate = function deactivate() {
  this.active = false;
  this.reset();
};

ChoiceList.prototype._deselectChoices = function _deselectChoices() {
  this.selectedChoices = [];
  var choiceButtons = this.choiceList.find('.choice-list-grid-wrapper')[0].children;
  for (var i = 0; i < choiceButtons.length; i++) {
    var button = $(choiceButtons[i]);
    button.removeClass('choice-selected');
  }
};

ChoiceList.prototype.reset = function reset() {
  this._deselectChoices();
  this.choiceList.find('.submit-choice-list-button')[0].disabled = true;
  this.choices = [];
  this.currentPage = 0;
  this._setupPager(this.currentPage);
};
//# sourceMappingURL=choice-list.js.map