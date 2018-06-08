const f56 = require('./f56-rs232')

const _ = require('lodash/fp')

var BillDispenser = function (config) {
  this.initialized = false
  this.initializing = false
  this.device = config.device
}

BillDispenser.factory = function factory (config) {
  return new BillDispenser(config)
}

module.exports = BillDispenser

BillDispenser.prototype._setup = function _setup (data) {
  this.fiatCode = data.fiatCode
}

BillDispenser.prototype.init = function init (data) {
  return new Promise((resolve) => {
    if (this.initializing || this.initialized) return resolve()

    this.initializing = true

    this._setup(data)

    const denominations = _.map(_.get('denomination'), data.cassettes)
    const fiatCode = this.fiatCode

    return f56.create(this.device)
      .then(() => f56.initialize(fiatCode, denominations[0], denominations[1]))
      .then(() => { this.initialized = true; this.initializing = false })
  })
}

BillDispenser.prototype.dispense = function dispense (notes) {
  try {
    return f56.billCount(notes[0], notes[1])
  } catch (err) {
    return Promise.reject(err)
  }
}

BillDispenser.prototype.billsPresent = function billsPresent () {
  return f56.billsPresent()
}
