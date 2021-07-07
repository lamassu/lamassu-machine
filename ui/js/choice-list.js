/* globals $ */

const ChoiceList = function(options) {
  this.choiceListId = options.id
  this.choiceList = $(`#${options.id}`)
  this.selectedChoices = []
  this.choices = []
  this.currentPage = 0
  this.active = options.active || true
}

/* ChoiceList.prototype.init = function init (availableChoices, cb) {
  this.callback = cb || null
  let _choices = [...availableChoices]
  this.choices = []
  while (_choices.length > 0) {
    this.choices.push(_choices.splice(0,4))
  }
  this.choiceList.find('.choice-list-pager').text(`${currentPage + 1}/${this.choices.length}`)
  this.choiceList.find('.choice-list-arrow-up').hide()
  if (this.choices.length === 1) {
    this.choiceList.find('.choice-list-arrow-down').hide()
    this.choiceList.find('.choice-list-pager').hide()
  }

  this._setupChoices(this.currentPage)

  const choiceList = document.getElementById(this.choiceListId)
  const self = this
  choiceList.addEventListener('mousedown', this._toggleChoiceEventListener(self))
} */

ChoiceList.prototype.init = function init (cb) {
  this.callback = cb
  this.choiceList.find('.choice-list-pager').text(`${currentPage + 1}/${this.choices.length}`)
  this.choiceList.find('.choice-list-arrow-up').hide()
  const choiceList = document.getElementById(this.choiceListId)
  const self = this
  choiceList.addEventListener('mousedown', this._toggleChoiceEventListener(self))
  return this
}

ChoiceList.prototype.replaceChoices = function (availableChoices) {
  this.reset()
  let _choices = [...availableChoices]
  this.choices = []
  while (_choices.length > 0) {
    this.choices.push(_choices.splice(0,4))
  }
  if (this.choices.length === 1) {
    this.choiceList.find('.choice-list-arrow-down').hide()
    this.choiceList.find('.choice-list-pager').hide()
  }

  this._setupChoices(this.currentPage)
}

ChoiceList.prototype._toggleChoiceEventListener = function _toggleChoiceEventListener(self) {
  return function(e) {
    if (!self.active) return
    const target = $(e.target)
    if (target.hasClass('submit-choice-list-button')) {
      return self.callback(self.selectedChoices)
    }
    if (target.hasClass('choice-list-item'))
      self._toggleChoice(target[0].innerText)
  }
}

ChoiceList.prototype._setupChoices = function _setupChoices(page) {
  const choices = this.choices[page]
  const choiceButtons = this.choiceList.find('.choice-list-grid-wrapper')[0].children
  for (let i = 0; i < choiceButtons.length; i++) {
    const button = $(choiceButtons[i])
    if (choices[i]) {
      button.show()
      button.text(choices[i])
      continue
    }
    button.hide()
  }
}

ChoiceList.prototype._toggleChoice = function _toggleChoice(choice) {
  const choiceIndex = this.selectedChoices.indexOf(choice)
  if (choiceIndex > -1) {
    this.selectedChoices.splice(choiceIndex, 1)
    this._toggleButton(choice)
    return
  }
  this.selectedChoices.push(choice)
  this._toggleButton(choice)
}

ChoiceList.prototype._toggleButton = function _toggleButton(choice) {
  const choiceButtons = this.choiceList.find('.choice-list-grid-wrapper')[0].children
  for (let i = 0; i < choiceButtons.length; i++) {
    const button = $(choiceButtons[i])
    if (button[0].innerText === choice) {
      button.toggleClass('testActive')
      break
    }
  }
}

ChoiceList.prototype.deactivate = function deactivate() {
  this.active = false
  this.reset()
}

ChoiceList.prototype.reset = function reset() {
  this.selectedChoices = []
  this.choices = []
  this.currentPage = 0
  const choiceButtons = this.choiceList.find('.choice-list-grid-wrapper')[0].children
  for (let i = 0; i < choiceButtons.length; i++) {
    const button = $(choiceButtons[i])
    button.removeClass('testActive')
  }
}