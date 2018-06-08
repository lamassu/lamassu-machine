const _ = require('lodash/fp')

var BillDispenser = function (config) {
  this.initialized = false
  this.initializing = false
  this.config = config
}

BillDispenser.factory = function factory (config) {
  return new BillDispenser(config)
}

module.exports = BillDispenser

BillDispenser.prototype._setup = function _setup (data) {
  this.fiatCode = data.fiatCode
  this.cassettes = this.config.mockedBalance
    ? this.config.mockedBalance.cassettes
    : data.cassettes
}

BillDispenser.prototype.init = function init (data, cb) {
  var self = this
  console.log('Mocked dispenser init', data)

  return new Promise(resolve => {
    if (self.initializing || self.initialized) {
      if (cb) cb()
      resolve()
      return
    }

    self.initializing = true
    self._setup(data)

    setTimeout(function () {
      self.initialized = true
      self.initializing = false
      if (cb) cb()
      resolve()
    }, 1000)
  })
}

BillDispenser.prototype.dispense = function dispense (notes, cb) {
  var self = this
  console.log('Mock dispensing...', notes, self.cassettes)

  return new Promise((resolve, reject) => {
    setTimeout(function () {
      const count = _.min([_.size(notes), _.size(self.cassettes)])
      for (var i = 0; i < count; i++) {
        if (notes[i] > self.cassettes[i].count) {
          var err = new Error('Mocked BillDispenser: not enough cash')
          err.statusCode = 570
          if (cb) cb(err)
          reject(err)
          return false
        }
      }

      var result = {
        bills: [
          {dispensed: notes[0], rejected: 0},
          {dispensed: notes[1], rejected: 0}
        ]
      }

      if (cb) cb(null, result)
      resolve(result)
    }, 2000)
  })
}
