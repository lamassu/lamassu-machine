/* globals $ */

const ChoiceList = function(options) {
  this.choiceListId = options.id
  this.choiceList = $(`#${options.id}`)
  this.selectedChoices = []
  this.choices = []
  this.currentPage = 0
  this.active = options.active || true
  this.choiceType = 'single' // default
}

ChoiceList.prototype.init = function init (cb) {
  this.callback = cb
  this.choiceList.find('.choice-list-arrow-up').hide()
  const choiceList = document.getElementById(this.choiceListId)
  const self = this
  choiceList.addEventListener('mousedown', this._toggleChoiceEventListener(self))
  return this
}

ChoiceList.prototype._toggleChoiceEventListener = function _toggleChoiceEventListener(self) {
  return function(e) {
    if (!self.active) return
    const target = $(e.target)
    if (target.hasClass('submit-choice-list-button')) {
      return self.callback(self.selectedChoices)
    }
    if (target.hasClass('choice-list-arrow-up')) {
      self.currentPage -= 1
      self._setupPager(self.currentPage)
      return self._setupChoices(self.currentPage)
    }
    if (target.hasClass('choice-list-arrow-down')) {
      self.currentPage += 1
      self._setupPager(self.currentPage)
      return self._setupChoices(self.currentPage)
    }
    if (target.hasClass('choice-list-item'))
      // if it's not a selectMultiple (choose multiple options) type of choice list,
      // then deselect the previous choice before selecting the new one
      if (self.choiceType !== 'selectMultiple') self._deselectChoices()
      self._toggleChoice(target[0].innerText)
  }
}

ChoiceList.prototype.replaceChoices = function (availableChoices, choiceType = 'single') {
  this.reset()
  this.choiceType = choiceType
  let _choices = [...availableChoices]
  this.choices = []
  while (_choices.length > 0) {
    this.choices.push(_choices.splice(0,4))
  }
  this._setupPager(this.currentPage)
  this._setupChoices(this.currentPage)
}

ChoiceList.prototype._setupPager = function _setupPager (targetPage) {
  this.choiceList.find('.choice-list-pager').text(`${targetPage + 1}/${this.choices.length}`)
  // if only one page of choices
  if (this.choices.length < 2) {
    this.choiceList.find('.choice-list-arrow-up').hide()
    this.choiceList.find('.choice-list-arrow-down').hide()
    this.choiceList.find('.choice-list-pager').hide()
    return
  }
  // if multiple pages and on page 0 (visually shows as 1)
  if (targetPage === 0) {
    this.choiceList.find('.choice-list-arrow-up').hide()
    this.choiceList.find('.choice-list-pager').show()
    this.choiceList.find('.choice-list-arrow-down').show()
    return
  }
  // on the last page
  if (targetPage + 1 === this.choices.length) {
    this.choiceList.find('.choice-list-arrow-up').show()
    this.choiceList.find('.choice-list-pager').show()
    this.choiceList.find('.choice-list-arrow-down').hide()
    return
  }
  // middle pages
  this.choiceList.find('.choice-list-arrow-up').show()
  this.choiceList.find('.choice-list-pager').show()
  this.choiceList.find('.choice-list-arrow-down').show()
}

ChoiceList.prototype._setupChoices = function _setupChoices(page) {
  const choices = this.choices[page]
  const choiceButtons = this.choiceList.find('.choice-list-grid-wrapper')[0].children
  for (let i = 0; i < choiceButtons.length; i++) {
    const button = $(choiceButtons[i])
    button.removeClass('testActive')
    if (choices[i]) {
      if (this.selectedChoices.includes(choices[i])) button.addClass('testActive')
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

ChoiceList.prototype._deselectChoices = function _deselectChoices() {
  this.selectedChoices = []
  const choiceButtons = this.choiceList.find('.choice-list-grid-wrapper')[0].children
  for (let i = 0; i < choiceButtons.length; i++) {
    const button = $(choiceButtons[i])
    button.removeClass('testActive')
  }
}

ChoiceList.prototype.reset = function reset() {
  this._deselectChoices()
  this.choices = []
  this.currentPage = 0
  this._setupPager(this.currentPage)
}