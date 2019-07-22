'use strict'

const EventEmitter = require('events').EventEmitter
const util = require('util')
const _ = require('lodash/fp')
const POLLING_INTERVAL = 100
const Rs232 = require('./id003rs232')
const Id003Fsm = require('./id003fsm')
const BN = require('../bn')

const Id003 = function (config) {
  EventEmitter.call(this)
  this.initialized = false
  this.pollingInterval = null
  this.config = config
  this.fiatCode = null
  this.denominations = null
  this._throttledError = _.throttle(2000, err => this.emit('error', err))
}

const IGNORE_RESPONSES = ['ack', 'inhibit', 'commMode', 'enq']

util.inherits(Id003, EventEmitter)
Id003.factory = function factory (config) {
  return new Id003(config)
}

Id003.prototype.setFiatCode = function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
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

Id003.prototype._run = function _run (cb) {
  const self = this
  const config = this.config
  const rs232Config = config.rs232
  rs232Config.fiatCode = config.fiatCode

  this.rs232 = Rs232.factory(rs232Config, this.denominations)

  this.rs232.on('message', function (cmd, data) {
    // TODO: temp, handle commands better (probably use fsm)
    if (cmd === 'invalid') {
      console.log('ERROR: invalid command')
      self._poll()
      return
    }

    if (!_.includes(cmd, IGNORE_RESPONSES)) self.id003Fsm[cmd](data)

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

    self._startPolling()

    self.id003Fsm.connect()

    const t0 = Date.now()
    const denominationsInterval = setInterval(function () {
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
  const self = this

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
  // If the run command is not executed id003Fsm will be undefined
  // Happens when we go to networkDown without connecting to the server first
  if (!this.id003Fsm || this.id003Fsm.is('Disable')) return
  if (this.id003Fsm.is('Enable')) this._send('inhibit')
  else this.id003Fsm.disableFlag = true
}

Id003.prototype.stack = function stack () {
  this._send('stack')
}

Id003.prototype.reject = function reject () {
  this._send('reject')
}

Id003.prototype.lowestBill = function lowestBill (fiat) {
  const bills = _.values(this._denominations())
  const filtered = bills.filter(bill => fiat.lte(bill))
  if (_.isEmpty(filtered)) return BN(Infinity)
  return BN(_.min(filtered))
}

Id003.prototype.highestBill = function highestBill (fiat) {
  const bills = _.values(this._denominations())
  const filtered = bills.filter(bill => fiat.gte(bill))
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
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
  this.rs232.send('status')
}

Id003.prototype._send = function _send (command, data) {
  this._stopPolling()
  // timeout because last poll could have been at now minus 1ms
  // potentially sending a new request before getting the response
  setTimeout(() => {
    this.rs232.send(command, data)
    this._startPolling()
  }, POLLING_INTERVAL)
}

Id003.prototype._startPolling = function () {
  this.pollingInterval = setInterval(() => {
    this._poll()
  }, POLLING_INTERVAL)
}

Id003.prototype._stopPolling = function () {
  clearInterval(this.pollingInterval)
}

module.exports = Id003
