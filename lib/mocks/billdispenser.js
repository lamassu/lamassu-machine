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
  this.fiatCode = data.fiatCode
}

BillDispenser.prototype.init = function init (data, cb) {
  var self = this

  return new Promise(resolve => {
    if (this.initializing || this.initialized) {
      if (cb) cb()
      resolve()
      return
    }

    this.initializing = true

    this._setup(data)

    setTimeout(function () {
      self.initialized = true
      self.initializing = false
      if (cb) cb()
      resolve()
    }, 1000)
  })
}

BillDispenser.prototype.dispense = function dispense (notes, cb) {
  console.log('Mock dispensing...')
  console.dir(notes)

  return new Promise(resolve => {
    setTimeout(function () {
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
