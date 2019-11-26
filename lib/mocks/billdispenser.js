const _ = require('lodash/fp')
const pDelay = require('delay')
const actionEmitter = require('../action-emitter')

var BillDispenser = function (config) {
  this.initialized = false
  this.initializing = false
  this.config = config
  this.type = 'F56'
  this.dispenseLimit = 20
  this.matchMockedErrors = _.wrap((errors, notes) => {
    const p = _.toPairs(errors)
    const f = _.conforms({
      1: (v) => _.isEqual(v, notes)
    })
    return _.get([0, 0], _.filter(f, p))
  }, _.get('mockedError', this.config, {}))

  console.log('billDispenserConfig: %j', config)
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

  return pDelay(2000)
    .then(() => {
      // check if notes is matching any error
      let error = this.matchMockedErrors(notes)
      if (!_.isUndefined(error)) {
        error = new Error(parseInt(error, 16))
      }

      // check if balance is available
      const count = _.min([_.size(notes), _.size(self.cassettes)])
      for (let i = 0; i < count; i++) {
        if (notes[i] > self.cassettes[i].count) {
          error = Error('not enough cash')
        }
      }

      const bills = [
        { dispensed: notes[0], rejected: 0 },
        { dispensed: notes[1], rejected: 0 }
      ]

      return this.billsPresent().then(() => {
        return { value: bills, error }
      })
    })

    // return the error
    .catch(err => {
      err.name = 'MockedDispenserError'
      err.err = err.message
      err.statusCode = 570
      throw err
    })
}

BillDispenser.prototype.waitForBillsRemoved = function waitForBillsRemoved () {
  return pDelay(2000).then(_.stubTrue)
}

BillDispenser.prototype.billsPresent = function billsPresent () {
  return pDelay(2000).then(_.stubFalse)
}
