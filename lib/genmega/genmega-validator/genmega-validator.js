const { EventEmitter } = require('events')
const util = require('util')
const _ = require('lodash/fp')
const genmega = require('genmega')

const BN = require('../../bn')
const returnValuesTable = require('../common/return-table')
const statesFsm = require('./states-fsm')

const POLLING_INTERVAL = 1000

const SENDONLY = 1
const RECVONLY = 2

const GenMegaValidator = function (config) {
  EventEmitter.call(this)
  this.escrowEnabled = config.escrowEnabled
  this.pollingInterval = null
  this.acceptingInterval = null
  this.acceptingBill = false
  this.device = config.rs232.device
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

GenMegaValidator.prototype.run = function run (cb, _) {
  this.statesFsm = statesFsm.factory()
  const self = this

  try {
    this.statesFsm.on('error', function (err) {
      self._throttledError(err)
    })

    this.statesFsm.on('reset', function () {
      self._reset()
    })

    this.statesFsm.on('denominations', function () {
      self._setEnableDenom()
    })

    this.statesFsm.on('setEnabled', function (data) {
      self.emit('enabled', data)
    })

    this.statesFsm.on('ready', function () {
      self._denominations()
    })

    this.statesFsm.on('stuck', function () {
      self._throttledError(new Error('Bill validator stuck'))
    })

    this.statesFsm.on('billsAccepted', function () {
      self.emit('billsAccepted')
    })

    this.statesFsm.on('billsRead', function (data) {
      if (!data.denomination) {
        console.log('bill rejected: unsupported denomination.')
        self.reject()
        return
      }
      self.emit('billsRead', data)
    })

    this.statesFsm.on('billsValid', function () {
      self.emit('billsValid')
    })

    this.statesFsm.on('billsRejected', function () {
      self.emit('billsRejected')
    })

    this.statesFsm.on('billsRefused', function () {
      self.emit('billsRefused')
    })

    this.statesFsm.on('stackerOpen', function () {
      self.emit('stackerOpen')
    })

    this._open()
    this._poll()

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
  return this.denominations !== null
}

GenMegaValidator.prototype.enable = function enable () {
  return this._enable()
}

GenMegaValidator.prototype.disable = function () {
  this._disable()
}

GenMegaValidator.prototype.stack = function stack () {
  this._stack()
}

GenMegaValidator.prototype.lowestBill = function lowestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.lte(bill))
  if (_.isEmpty(filtered)) return BN(_.min(bills))
  return BN(_.min(filtered))
}

GenMegaValidator.prototype.highestBill = function highestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.gte(bill))
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
}

GenMegaValidator.prototype._denominations = function () {
  this._stopPolling()
  if (this.denominations) return
  const { iRet, data } = genmega.BAUGetSupportCurrency()
  // For now only supports one currency based on the current firmware
  if (iRet > 1) // count of currencies supported
    return this.emit('error', 'Multiple currencies detected!')

  const supportedCurrencies = data.split(',')
  const fiatCode = supportedCurrencies[0]
  const denominationsEnabled = supportedCurrencies.slice(1)
  if (fiatCode !== this.fiatCode) {
    console.log('Found a bill not matching the defined fiat code, rejecting...')
    this.emit('reject')
  }
  this.denominations = Object.fromEntries(denominationsEnabled.map((denom, idx) => [idx+1, Number(denom)]))
  this._executeFsmEvent('denominations')
  this._poll()
}

GenMegaValidator.prototype._setEnableDenom = function () {
  this._stopPolling()
  this._reset()
  const { iRet } = genmega.BAUSetEnableDenom(`${this.fiatCode},1111111`)
  // iRet: (-2) Function of the previous operation is not completed
  // Does this mean that the device only accepts one operation at a time?
  if (iRet < 0) {
    this.emit('error', returnValuesTable[iRet])
  }
  this._executeFsmEvent('setEnabled', { data1: 1, data2: 2 })
  this._poll()
}

GenMegaValidator.prototype._disable = function () {
  if (!this.statesFsm || this.statesFsm.is('Disable')) return
  this._stopPolling()
  this.acceptingBill = false
  // TODO: What to do if we have a note read already?
  genmega.BAUCancel()
  this._executeFsmEvent('disable')
}

GenMegaValidator.prototype._enable = function _enable () {
  this._stopPolling()
  let result = { iRet: 0, data: '' }
  this._executeFsmEvent('enable')
  const { iRet, data } = genmega.BAUAcceptBill(SENDONLY)
  if (iRet < 0)
    return this._processOperationResult(iRet)
  this.acceptingBill = true
  if (data !== '0')
    return this._executeFsmEvent('escrow', { denomination: this.denominations[data] })
  this._poll()
  this.acceptingInterval = setInterval(() => {
    if (!this.acceptingBill)
      return clearInterval(this.acceptingInterval)
    const { iRet, data } = genmega.BAUAcceptBill(RECVONLY)
    if (iRet < 0)
      return this._processOperationResult(iRet)
    if (data !== '0' && iRet !== 3) {
      result.data = data
      result.iRet = iRet
      if (result.data && (result.iRet === 0)) {
        this._executeFsmEvent('escrow', { denomination: this.denominations[data] })
        result = { iRet: 0, data: '' }
        return
      }
      this._processOperationResult(iRet)
    }
  }, 200)
}

GenMegaValidator.prototype._open = function () {
  if (!this.device) throw new Error('No serial port name provided!')
  let { iRet } = genmega.BAUOpen(this.device)
  if (iRet < 0) {
    this.emit('error', returnValuesTable[iRet])
  }

  if (typeof(this.escrowEnabled) === 'boolean') {
    iRet = genmega.BAUSetCapabilities(this.escrowEnabled).iRet
    if (iRet < 0) this.emit('error', returnValuesTable[iRet])
  }

  this._reset()
  this._executeFsmEvent('connect')
}

GenMegaValidator.prototype._reset = function () {
  const { iRet } = genmega.BAUReset()
  if (iRet < 0) {
    console.error(iRet)
  }
}

GenMegaValidator.prototype.reject = function () {
  let iRet = this.escrowEnabled ? genmega.BAUReject().iRet : 0
  if (this.escrowEnabled && iRet < 0) {
    console.error(iRet)
    this._processOperationResult(iRet)
  } else {
    this._stopPolling()
    this._executeFsmEvent('rejected')
    this._poll()
  }
}

GenMegaValidator.prototype._stack = function () {
  const { iRet } = genmega.BAUStack()
  if (iRet < 0) {
    console.error(iRet)
    this._processOperationResult(iRet)
  } else {
    this._stopPolling()
    this._executeFsmEvent('stacked')
    this._poll()
  }
}

GenMegaValidator.prototype._status = function () {
  const { iRet, result } = genmega.BAUStatus()
  if (iRet < 0)
    console.error(iRet)
  return result
}

GenMegaValidator.prototype._processOperationResult = function (iRet) {
  if (iRet === -13) return this._executeFsmEvent('returned')
  return this._throttledError(new Error(returnValuesTable[iRet.toString()]))
}

GenMegaValidator.prototype._massageDeviceStatuses = function (obj) {
  if (obj.bCassetteAttached === '0') return 'stackerOpen'
  if (obj.bIdling === '1') return 'idling'
  if (obj.bAccepting === '1') return 'accepting'
  if (obj.bEscrow === '1') return 'escrow'
  if (obj.bStacking === '1') return 'stacking'
  if (obj.bReturning === '1') return 'returning'
  if (obj.bJammed === '1') return 'acceptorJam'
  if (obj.bStackerFull === '1') return 'stackerFull'
  if (obj.bPaused === '1') return 'pause'
  if (obj.bFailure === '1') return 'failure'
  return 'badFrame'
}

GenMegaValidator.prototype._executeFsmEvent = function (cmd, data) {
  if (data) this.statesFsm[cmd](data)
  else this.statesFsm[cmd]()
}

GenMegaValidator.prototype._poll = function () {
  this._stopPolling()
  this.pollingInterval = setInterval(() => {
    const status = this._status()
    // Massage statuses i.e map to a valid FSM event
    const cmd = this._massageDeviceStatuses(status)
    this._executeFsmEvent(cmd)
  }, POLLING_INTERVAL)
}

GenMegaValidator.prototype._stopPolling = function () {
  clearInterval(this.pollingInterval)
}

module.exports = GenMegaValidator
