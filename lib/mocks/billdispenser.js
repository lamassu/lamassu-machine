var BillDispenser = function () {
  this.initialized = false
  this.initializing = false
}

BillDispenser.factory = function factory (config) {
  var billDispenser = new BillDispenser(config)
  return billDispenser
}

module.exports = BillDispenser

BillDispenser.prototype._setup = function _setup (data) {
  this.currency = data.currency
}

BillDispenser.prototype.init = function init (data, cb) {
  var self = this

  if (this.initializing || this.initialized) return cb()
  this.initializing = true

  this._setup(data)
  setTimeout(function () {
    self.initialized = true
    self.initializing = false
    cb()
  }, 1000)
}

BillDispenser.prototype.dispense = function dispense (notes, cb) {
  console.log('Mock dispensing...')
  console.dir(notes)
  setTimeout(function () {
    var result = {
      bills: [
        {accepted: notes[0], rejected: 0},
        {accepted: notes[1], rejected: 0}
      ]
    }
    cb(null, result)
  }, 2000)
}
