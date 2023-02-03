const genmega = require('genmega')
const EventEmitter = require('events').EventEmitter
const util = require('util')
const _ = require('lodash/fp')
const returnValuesTable = require('../common/return-table')

const statesFsm = require('./states-fsm')

const BN = require('../../bn')

const POLLING_INTERVAL = 200

const GenMegaValidator = function (config) {
  EventEmitter.call(this)
  this.pollingInterval = null
  this.device = config.genmega.bau
  this.fiatCode = config.fiatCode
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

GenMegaValidator.prototype.run = function run (cb) {
  this.statesFsm = statesFsm.factory(this.config)
  this._run(cb)
}

GenMegaValidator.prototype._run = function _run (cb) {
  try {
    this.statesFsm.on('dispatch', function (cmd, data) {
      this._send(cmd, data)
    })

    this.statesFsm.on('denominations', function () {
      this._reset()
    })

    this.statesFsm.on('getEnabled', function (data) {
      this._setEnableDenom()
      this.emit('enabled', data)
    })

    this.statesFsm.on('setEnabled', function (data) {
      this.emit('enabled', data)
      this.emit('standby', data)
    })

    this.statesFsm.on('ready', function () {
      this.denominations()
    })

    this.statesFsm.on('stale', function () {
      this._reset()
    })

    this.statesFsm.on('stuck', function () {
      this.emit('error', new Error('Bill validator stuck'))
    })

    this.statesFsm.on('billAccepted', function () {
      this.emit('billAccepted')
    })

    this.statesFsm.on('billRead', function (data) {
      if (!data.denomination) {
        console.log('bill rejected: unsupported denomination. Code: 0x%s',
          data.code.toString(16))
        this._reject()
        return
      }
      this.emit('billRead', data)
    })

    this.statesFsm.on('billValid', function () {
      this.emit('billValid')
    })

    this.statesFsm.on('billRejected', function () {
      this.emit('billRejected')
    })

    this.statesFsm.on('billRefused', function () {
      this.emit('billRefused')
    })

    this.statesFsm.on('standby', function () {
      this._send('getEnabled')
    })

    this.statesFsm.on('stackerOpen', function () {
      this.emit('stackerOpen')
    })

    this._open(this.device.serialPortName)
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
  } catch (err) {
    cb(err)
  }
}

GenMegaValidator.prototype.close = function () {
  this._stopPolling()
  genmega.BAUClose()
}

// TODO: Do we need a refresh for GM?

GenMegaValidator.prototype.hasDenominations = function () {
  return this._denominations() !== null
}

GenMegaValidator.prototype.enable = function enable () {
  return this._enable()
}

GenMegaValidator.prototype.disable = function () {
  // TODO
  // // If the run command is not executed id003Fsm will be undefined
  // // Happens when we go to networkDown without connecting to the server first
  // if (!this.id003Fsm || this.id003Fsm.is('Disable')) return
  // if (this.id003Fsm.is('Enable')) this._send('inhibit')
  // else this.id003Fsm.disableFlag = true
}

GenMegaValidator.prototype.stack = function stack () {
  this._stack()
}

GenMegaValidator.prototype.reject = function reject () {
  this._reject()
}

GenMegaValidator.prototype.lowestBill = function lowestBill (fiat) {
  const bills = _.values(this._denominations())
  const filtered = bills.filter(bill => fiat.lte(bill))
  if (_.isEmpty(filtered)) return BN(_.min(bills))
  return BN(_.min(filtered))
}

GenMegaValidator.prototype.highestBill = function highestBill (fiat) {
  const bills = _.values(this._denominations())
  const filtered = bills.filter(bill => fiat.gte(bill))
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
}

GenMegaValidator.prototype._denominations = function () {
  if (this.denominations) return
  this.denominations = {}
  // For now only supports one currency based on the current firmware
  const supportedCurrencies = genmega.BAUGetSupportCurrency()
  const supportedCurrenciesFormatted = supportedCurrencies.split(',')
  const fiatCode = _.head(supportedCurrenciesFormatted)
  const denominationsEnabled = _.tail(supportedCurrenciesFormatted)
  if (fiatCode !== this.fiatCode) {
    console.log('Found a bill not matching the defined fiat code, rejecting...')
    this.emit('reject')
  }
  for (var escrowIndex = 0; escrowIndex < denominationsEnabled.length; escrowIndex++) {
    this.denominations[escrowIndex] = denominationsEnabled[escrowIndex]
  }
}

GenMegaValidator.prototype._setEnableDenom = function () {
  const ALL_ENABLE = 'USD,1111111'
  const { iRet } = genmega.BAUSetEnableDenom(ALL_ENABLE)
  // iRet: (-2) Function of the previous operation is not completed
  // Does this mean that the device only accepts one operation at a time?
  if (iRet < 0) {
    this.emit('error', returnValuesTable[iRet])
  }
}

GenMegaValidator.prototype._enable = function () {
  return genmega.BAUEnable()
    .then(escrowIndex => {
      this._executeFsmEvent('escrow', { denomination: this.denominations[escrowIndex] })
    })
    // TODO: do a catch where we call getLastError?
    .catch(err => {
      console.error(err)
    })
}

GenMegaValidator.prototype._open = function (serialPortName) {
  if (!serialPortName) throw new Error('No serial port name provided!')
  const { iRet } = genmega.BAUOpen(serialPortName)
  if (iRet < 0) {
    this.emit('error', returnValuesTable[iRet])
  }
}

GenMegaValidator.prototype._reset = function () {
  const { iRet } = genmega.BAUReset()
  if (iRet < 0) {
    console.error(iRet)
  }
}

GenMegaValidator.prototype._reject = function () {
  const { iRet } = genmega.BAUReject()
  if (iRet < 0) {
    console.error(iRet)
  }
}

GenMegaValidator.prototype._stack = function () {
  const { iRet } = genmega.BAUStack()
  if (iRet < 0) {
    console.error(iRet)
  }
}

GenMegaValidator.prototype._status = function () {
  const { iRet, result } = genmega.BAUStatus()
  if (iRet < 0) {
    this.emit('error', returnValuesTable[iRet])
  }
  return result
}

GenMegaValidator.prototype._massageDeviceStatuses = function (obj) {
  // TODO: Temporary function to map the statuses object, handle unknown status, etc.
}

GenMegaValidator.prototype._executeFsmEvent = function (cmd, data) {
  if (data) this.statesFsm[cmd](data)
  else this.statesFsm[cmd]()
}

GenMegaValidator.prototype._startPolling = function () {
  this._stopPolling()
  this.pollingInterval = setInterval(() => {
    const status = this._status()
    // Massage statuses i.e map to a valid command
    const cmd = this._massageDeviceStatuses(status)
    this._executeFsmEvent(cmd)
  }, POLLING_INTERVAL)
}

GenMegaValidator.prototype._stopPolling = function () {
  clearInterval(this.pollingInterval)
}

GenMegaValidator.prototype._connect = function () {
  this._executeFsmEvent('connect')
}

// TODO: Useful for GM?
GenMegaValidator.prototype._send = function _send (command, data) {
  switch (command) {
    case 'dispatch': return null
    case 'getEnable': return null
    case 'unInhibit': return null
    case 'inhibit': return null
    default: return null
  }
}

module.exports = GenMegaValidator