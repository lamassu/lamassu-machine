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

  // Uncomment for connection error
  // cb(new Error('Mock error 1'), null)

  // Uncomment for dispense error
  // const dispensed1 = Math.max(notes[0] - 1, 0)
  // const dispensed2 = Math.max(notes[1] - 1, 0)
  // const rejected1 = notes[0] - dispensed1
  // const rejected2 = notes[1] - dispensed2

  // return cb(null, {
  //   bills: [
  //     {dispensed: dispensed1, rejected: rejected1},
  //     {dispensed: dispensed2, rejected: rejected2}
  //   ],
  //   err: 'Mock error 2'
  // })

  // Uncomment for success
  setTimeout(function () {
    var result = {
      bills: [
        {dispensed: notes[0], rejected: 0},
        {dispensed: notes[1], rejected: 0}
      ]
    }
    cb(null, result)
  }, 1000)
}
