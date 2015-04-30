'use strict'

var EventEmitter = require('events').EventEmitter
var util = require('util')
var _ = require('lodash')
var POLLING_INTERVAL = 100
var Rs232 = require('./id003rs232')
var Id003Fsm = require('./id003fsm')

var Id003 = function (config) {
  EventEmitter.call(this)
  this.initialized = false
  this.pollingInterval = null
  this.config = config
  this.currency = config.currency
  this.denominations = null
  var self = this
  this._throttledError = _.throttle(function (err) {
    self.emit('error', err)
  }, 2000)
}

var IGNORE_RESPONSES = ['ack', 'inhibit', 'commMode', 'enq']

util.inherits(Id003, EventEmitter)
Id003.factory = function factory (config) {
  return new Id003(config)
}

Id003.prototype.lightOn = function lightOn () {
  if (this.rs232 !== undefined) {
    console.log('lightOn')
    this.rs232.lightOn()
  }
}

Id003.prototype.lightOff = function lightOff () {
  if (this.rs232 !== undefined) {
    console.log('lightOff')
    this.rs232.lightOff()
  }
}

Id003.prototype.run = function run (cb) {
  this.id003Fsm = Id003Fsm.factory(this.config)
  this._run(cb)
}

Id003.prototype.isCashboxOut = function isCashboxOut () {
  return this.id003Fsm.is('StackerOpen')
}

Id003.prototype._run = function _run (cb) {
  var self = this
  var config = this.config
  var rs232Config = config.rs232
  rs232Config.currency = config.currency

  this.rs232 = Rs232.factory(rs232Config, this.denominations)

  this.rs232.on('message', function (cmd, data) {
    // TODO: temp, handle commands better (probably use fsm)
    if (cmd === 'invalid') {
      console.log('ERROR: invalid command')
      self._poll()
      return
    }
    if (!_.contains(IGNORE_RESPONSES, cmd)) self.id003Fsm[cmd](data)

    if (cmd === 'commMode') {
      clearInterval(self.pollingInterval)
    }
    if (cmd === 'enq') return self._poll()
  })

  this.rs232.on('unknownCommand', function (code) {
    throw new Error('unknown code: ' + code.toString(16))
  })

  this.rs232.on('error', function (err) {
    self._throttledError(err)
  })

  this.rs232.on('badFrame', function () {
    self.id003Fsm.badFrame()
    self._poll()
  })

  this.id003Fsm.on('dispatch', function (cmd, data) {
    self._send(cmd, data)
  })

  this.id003Fsm.on('denominations', function () {
    self._send('reset')
  })

  this.id003Fsm.on('getEnabled', function (data) {
    self._send('enableAll')
    self.emit('enabled', data)
  })

  this.id003Fsm.on('setEnabled', function (data) {
    self.emit('enabled', data)
    self.emit('standby', data)
  })

  this.id003Fsm.on('ready', function () {
    self._send('denominations')
  })

  this.id003Fsm.on('stale', function () {
    self._send('reset')
  })

  this.id003Fsm.on('stuck', function () {
    self.emit('error', new Error('Bill validator stuck'))
  })

  this.id003Fsm.on('billAccepted', function () {
    self.emit('billAccepted')
  })

  this.id003Fsm.on('billRead', function (data) {
    if (!data.denomination) {
      console.log('bill rejected: unsupported denomination. Code: 0x%s',
        data.code.toString(16))
      self._send('reject')
      return
    }
    self.emit('billRead', data)
  })

  this.id003Fsm.on('billValid', function () {
    self.emit('billValid')
  })

  this.id003Fsm.on('billRejected', function () {
    self.emit('billRejected')
  })

  this.id003Fsm.on('billRefused', function () {
    self.emit('billRefused')
  })

  this.id003Fsm.on('standby', function () {
    self._send('getEnabled')
  })

  this.id003Fsm.on('stackerOpen', function () {
    self.emit('stackerOpen')
  })

  this.rs232.open(function (err) {
    if (err) return cb(err)

    self.pollingInterval = setInterval(function () {
      self._poll()
    }, POLLING_INTERVAL)

    self.id003Fsm.connect()

    var t0 = Date.now()
    var denominationsInterval = setInterval(function () {
      if (self.hasDenominations()) {
        clearInterval(denominationsInterval)
        return cb()
      }

      if (Date.now() - t0 > 5000) {
        clearInterval(denominationsInterval)
        cb(new Error('Timeout waiting for denominations'))
      }
    }, 500)
  })
}

Id003.prototype.close = function close (cb) {
  clearInterval(this.pollingInterval)
  this.rs232.close(function (err) {
    if (err) console.log(err)
    cb(err)
  })
}

Id003.prototype.refresh = function refresh (cb) {
  var self = this

  this.id003Fsm = Id003Fsm.factory(this.config)
  this.id003Fsm.refresh()
  this.close(function () {
    self._run(function (err) {
      console.log('Bill validator running again.')
      cb(err)
    })
  })
}

Id003.prototype.enable = function enable () {
  this.id003Fsm.disableFlag = false
  this._send('unInhibit')
}

Id003.prototype.disable = function () {
  if (this.id003Fsm.is('Disable')) return
  if (this.id003Fsm.is('Enable')) this._send('inhibit')
  else this.id003Fsm.disableFlag = true
}

Id003.prototype.stack = function stack () {
  this._send('stack')
}

Id003.prototype.reject = function reject () {
  this._send('reject')
}

Id003.prototype.lowestBill = function lowestBill () {
  var bills = _.values(this._denominations())
  return _.min(bills)
}

Id003.prototype.highestBill = function highestBill (fiat) {
  var bills = _.values(this._denominations())
  var filtered = _.filter(bills, function (bill) { return bill <= fiat })
  if (_.isEmpty(filtered)) return null
  return _.max(filtered)
}

Id003.prototype.hasDenominations = function hasDenominations () {
  return this._denominations() !== null
}

Id003.prototype._denominations = function _denominations () {
  if (this.denominations) return this.denominations
  this.denominations = this.rs232 ? this.rs232.denominations : null
  return this.denominations
}

Id003.prototype._poll = function _poll () {
  this._send('status')
}

Id003.prototype._send = function _send (command, data) {
  this.rs232.send(command, data)
}

module.exports = Id003
