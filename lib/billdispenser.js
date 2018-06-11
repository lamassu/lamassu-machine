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
  return new Promise((resolve) => {
    if (this.initializing || this.initialized) return resolve()
    this.initializing = true

    this._setup(data)
    this.device.open(() => {
      this.reset(data.cassettes, () => {
        this.initialized = true
        this.initializing = false
        resolve()
      })
    })
  })
}

BillDispenser.prototype.reset = function reset (cassettes) {
  return new Promise((resolve, reject) => {
    this.device.reset(cassettes, this.fiatCode, function (err) {
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
  return new Promise((resolve, reject) => {
    if (this.initializing || this.initialized) return resolve()
    this.initializing = true

    this.device.open(() => {
      this.device.updateSerialNumber((err) => {
        this.initialized = true
        this.initializing = false

        if (err) return reject(err)
        return resolve()
      })
    })
  })
}

BillDispenser.prototype.dispense = function dispense (notes) {
  return this.device.dispense(notes)
}
