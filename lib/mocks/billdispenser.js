const _ = require('lodash')
const Bluebird = require('bluebird')

var BillDispenser = function (config) {
  this.initialized = false
  this.initializing = false
  this.config = config
  this.matchMockedErrors = _.wrap(_.get(this.config, 'mockedError', {}), (errors, notes) => {
    const p = _.toPairs(errors)
    const f = _.conforms({
      1: (v) => _.isEqual(v, notes)
    })
    return _.get(_.filter(p, f), [0, 0])
  })
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

BillDispenser.prototype.init = function init (data) {
  var self = this
  console.log('Mocked dispenser init', data)

  return new Promise(resolve => {
    if (this.initializing || this.initialized) {
      resolve()
      return
    }

    this.initializing = true
    this._setup(data)

    setTimeout(function () {
      self.initialized = true
      self.initializing = false
      resolve()
    }, 1000)
  })
}

BillDispenser.prototype.dispense = function dispense (notes) {
  var self = this
  console.log('Mock dispensing...', notes, self.cassettes)

  return Bluebird.delay(2000)

    // check if notes is matching any error
    .then(() => {
      const error = this.matchMockedErrors(notes)

      if (!_.isUndefined(error)) {
        const dispenseErr = new Error(parseInt(error, 16))
        dispenseErr.name = 'DispenserError'

        throw dispenseErr
      }
    })

    // check if balance is available
    .then(() => {
      const count = _.min([_.size(notes), _.size(self.cassettes)])
      for (var i = 0; i < count; i++) {
        if (notes[i] > self.cassettes[i].count) {
          var dispenseErr = new Error('not enough cash')
          dispenseErr.name = 'DispenserError'
          dispenseErr.statusCode = 570

          throw dispenseErr
        }
      }
    })

    // return a successful result
    .then(() => {
      const result = {
        bills: [
          {dispensed: notes[0], rejected: 0},
          {dispensed: notes[1], rejected: 0}
        ]
      }

      return result
    })
}
