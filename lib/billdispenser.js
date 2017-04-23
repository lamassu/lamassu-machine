var deviceDriver = require('./puloon/puloonrs232')

var BillDispenser = function (config) {
  this.device = deviceDriver.factory(config.device)
  this.device.on('response', function (res) {
    console.log('INFO dispenser response')
    console.dir(res)
  })
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
  this.device.open(function () {
    self.reset(data.cassettes, function () {
      self.initialized = true
      self.initializing = false
      cb()
    })
  })
}

BillDispenser.prototype.reset = function reset (cassettes, cb) {
  var device = this.device
  var self = this
  device.reset(cassettes, self.fiatCode, function (err) {
    if (err) {
      console.log('Serialport error: ' + err.message)
    }
    cb(err)
  })
}

BillDispenser.prototype.open = function open (cb) {
  var self = this

  if (this.initializing || this.initialized) return cb()
  this.initializing = true

  this.device.open(function () {
    self.device.updateSerialNumber(function (err) {
      self.initialized = true
      self.initializing = false
      cb(err)
    })
  })
}

BillDispenser.prototype.dispense = function dispense (notes, cb) {
  var device = this.device

  device.dispense(notes)
  .then(r => cb(null, r))
  .catch(e => cb(e))
}
