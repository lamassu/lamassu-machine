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
  return new BillDispenser(config)
}

module.exports = BillDispenser

BillDispenser.prototype._setup = function _setup (data) {
  this.fiatCode = data.fiatCode
}

BillDispenser.prototype.init = function init (data) {
  var self = this

  return new Promise((resolve) => {
    if (this.initializing || this.initialized) return resolve()
    this.initializing = true

    this._setup(data)
    this.device.open(() => {
      self.reset(data.cassettes, function () {
        self.initialized = true
        self.initializing = false
        resolve()
      })
    })
  })
}

BillDispenser.prototype.reset = function reset (cassettes) {
  var self = this
  var device = this.device

  return new Promise((resolve, reject) => {
    device.reset(cassettes, self.fiatCode, function (err) {
      if (err) {
        console.log('Serialport error: ' + err.message)
        reject(err)
      } else {
        resolve()
      }
    })
  })
}

BillDispenser.prototype.open = function open () {
  var self = this

  return new Promise((resolve, reject) => {
    if (this.initializing || this.initialized) return resolve()
    this.initializing = true

    this.device.open(() => {
      self.device.updateSerialNumber((err) => {
        self.initialized = true
        self.initializing = false

        if (err) reject(err)
        else resolve()
      })
    })
  })
}

BillDispenser.prototype.dispense = function dispense (notes) {
  var device = this.device

  return device.dispense(notes)
}
