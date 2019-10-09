var deviceDriver = require('./puloonrs232')
const actionEmitter = require('../action-emitter')

var BillDispenser = function (config) {
  this.device = deviceDriver.factory(config.device)
  this.initialized = false
  this.initializing = false
  this.type = 'Puloon'
}

BillDispenser.factory = function factory (config) {
  return new BillDispenser(config)
}

module.exports = BillDispenser

BillDispenser.prototype._setup = function _setup (data) {
  this.fiatCode = data.fiatCode
}

BillDispenser.prototype.close = function close () {
  this.device.close()
  this.initialized = false
}

BillDispenser.prototype.init = function init (data) {
  return new Promise((resolve) => {
    if (this.initializing || this.initialized) return resolve()
    this.initializing = true

    this._setup(data)
    this.device.open(() => {
      return this.reset(data.cassettes)
        .then(() => {
          this.initialized = true
          this.initializing = false
          return resolve()
        })
    })
  })
}

BillDispenser.prototype.reset = function reset (cassettes) {
  return new Promise((resolve, reject) => {
    this.device.reset(cassettes, this.fiatCode, err => {
      if (err) {
        console.log('Serialport error: ' + err.message)
        return reject(err)
      }

      resolve()
    })
  })
}

BillDispenser.prototype.dispense = function dispense (notes, current, of) {
  return this.device.dispense(notes)
    .then(({ bills, error }) => {
      const action = error ? 'failure' : 'dispensed'

      actionEmitter.emit('billDispenser', { action, value: { bills }, current, of, error })

      if (action === 'failure') {
        throw error
      }
    })
    .catch(err => {
      this.close()
      err.name = 'PuloonDispenseError'
      console.log('PULOON | dispense error 4', err)
      throw err
    })
}

BillDispenser.prototype.billsPresent = function billsPresent () {
  return Promise.resolve(true)
}

BillDispenser.prototype.waitForBillsRemoved = function waitForBillsRemoved () {
  return Promise.resolve(true)
}
