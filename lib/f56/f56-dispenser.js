const f56 = require('./f56-rs232')

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
  return new Promise((resolve, reject) => {
    if (this.initializing || this.initialized) return resolve()

    this.initializing = true

    this._setup(data)

    const cassettes = data.cassettes
    const fiatCode = this.fiatCode

    return f56.create(this.device)
    .then(() => f56.initialize(fiatCode, cassettes[0], cassettes[1]))
  })
}

BillDispenser.prototype.dispense = function dispense (notes) {
  return f56.create(this.device)
  .then(() => f56.billCount(notes[0], notes[1]))
}
