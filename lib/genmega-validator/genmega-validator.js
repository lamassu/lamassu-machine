const genmega = require('genmega')
const EventEmitter = require('events').EventEmitter
const util = require('util')
const _ = require('lodash/fp')

const statesFsm = require('./states-fsm')

const BN = require('../bn')

// const denominationsTable = require('./denominations')

const GenMegaValidator = function (config) {
  EventEmitter.call(this)
  EventEmitter.call(this)
  this.pollingInterval = null
  this.device = config.rs232.device
  this.fiatCode = null
  this.denominations = null
  this._throttledError = _.throttle(2000, err => this.emit('error', err))
}

util.inherits(GenMegaValidator, EventEmitter)
GenMegaValidator.factory = function factory (config) {
  return new GenMegaValidator(config)
}

GenMegaValidator.prototype.setFiatCode = function (fiatCode) {
  this.fiatCode = fiatCode
}

GenMegaValidator.prototype.lightOn = _.noop

GenMegaValidator.prototype.lightOff = _.noop

Ccnet.prototype.run = function (cb) {
  return rs232.create(this.device)
    .then(() => {
      rs232.emitter.on('handleResponse', (response, command) => this._handleResponse(response, command))
      rs232.emitter.on('error', (err) => this._throttledError(err))
      rs232.emitter.on('disconnected', () => this.emit('disconnected'))
      statesFsm.on('command', it => this._send(it))
      statesFsm.on('billAccepted', () => this.emit('billAccepted'))
      statesFsm.on('jam', () => this.emit('jam'))
      statesFsm.on('billValid', () => this.emit('billValid'))
      statesFsm.on('billRejected', () => this.emit('billRejected'))
      statesFsm.on('stackerOpen', () => this.emit('stackerOpen'))
      statesFsm.on('billRead', (data) => {
        const denomination = this._denominations()[data[0]]
        if (!denomination) {
          console.log('bill rejected: unsupported denomination.')
          this._send(commands.RETURN)
          return
        }
        this.emit('billRead', { denomination })
      })
    })
    .then(() => {
      this._startPolling()
      this._connect()

      const t0 = Date.now()
      const denominationsInterval = setInterval(() => {
        if (this.hasDenominations()) {
          clearInterval(denominationsInterval)
          return cb()
        }

        if (Date.now() - t0 > 5000) {
          clearInterval(denominationsInterval)
          cb(new Error('Timeout waiting for denominations'))
        }
      }, 500)
    })
    .catch(cb)
}

module.exports = GenMegaValidator
