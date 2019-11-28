const f56 = require('./f56-rs232')
const actionEmitter = require('../action-emitter')

const _ = require('lodash/fp')

var BillDispenser = function (config) {
  this.initialized = false
  this.initializing = false
  this.device = config.device
  this.type = 'F56'
  this.dispenseLimit = 20
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
  return f56.billCount(notes[0], notes[1])
    .then(({ bills, error }) => {
      if (error) {
        this.close()
        error.name = 'F56DispenseError'
        error.statusCode = 570
      }
      return { value: bills, error }
    })
}

BillDispenser.prototype.close = function close () {
  f56.close()
  this.initialized = false
}

BillDispenser.prototype.billsPresent = function billsPresent () {
  return f56.billsPresent()
}

BillDispenser.prototype.waitForBillsRemoved = function waitForBillsRemoved () {
  return new Promise((resolve, reject) => {
    const interval = setInterval((evt) => {
      this.billsPresent()
        .then((billsArePresent) => {
          if (!billsArePresent) {
            clearInterval(interval)
            resolve(true)
          }
        })
        .catch((err) => {
          if (err.code === 'DLEVEL_FSM_ERROR') return
          clearInterval(interval)
          reject(err)
        })
    },
    1000)
  })
}
