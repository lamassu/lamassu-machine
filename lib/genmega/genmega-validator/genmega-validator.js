const { EventEmitter } = require('events')
const util = require('util')
const _ = require('lodash/fp')
const { bau } = require('genmega')

const BN = require('../../bn')

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
  this.currentStatus = null
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
  try {
    this._open()
    this._reset(true)
    this._setSupportedDenominations()
    this._setEnabledDenominations()
    this.emit('enabled')
    this._startPolling()
    return cb()
  } catch (err) {
    cb(err)
  }
}

GenMegaValidator.prototype.close = function () {
  this._stopPolling()
  bau.close()
}

// TODO: Do we need a refresh for GM?

GenMegaValidator.prototype.hasDenominations = function () {
  return this.denominations !== null
}

GenMegaValidator.prototype.lowestBill = function lowestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.lte(bill))
  return BN(_.min(_.isEmpty(filtered) ? bills : filtered))
}

GenMegaValidator.prototype.highestBill = function highestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.gte(bill))
  return BN(_.isEmpty(filtered) ? -Infinity : _.max(filtered))
}

GenMegaValidator.prototype._setSupportedDenominations = function () {
  if (this.hasDenominations()) return

  const { return_int, data } = bau.getSupportCurrency()
  // For now only supports one currency based on the current firmware
  if (return_int > 1) // count of currencies supported
    throw new Error('Multiple currencies detected!')

  const [fiatCode, ...denominations] = data.split(',')

  if (fiatCode !== this.fiatCode)
    throw new Error('Supported fiat currency different from requested currency')

  this.denominations = Object.fromEntries(denominations.map((denom, idx) => [idx+1, Number(denom)]))
}

GenMegaValidator.prototype._setEnabledDenominations = function () {
  const { return_int, return_message } = bau.setEnableDenom(`${this.fiatCode},1111111`)
  // return_int: (-2) Function of the previous operation is not completed
  // Does this mean that the device only accepts one operation at a time?
  if (return_int < 0) throw new Error(return_message)
}

GenMegaValidator.prototype.disable = function () {
  if (!this.acceptingBill) return
  this.acceptingBill = false
  // TODO: What to do if we have a note read already?
  const { return_int, data } = bau.cancel()
  if (return_int === 0 && data && data !== '0')
    this.reject()
}

GenMegaValidator.prototype.enable = function enable () {
  const { return_int, return_code, return_message, data } = bau.acceptBill(SENDONLY)
  if (return_int < 0) return this._processOperationResult(return_code, return_message)

  this.acceptingBill = true

  this.acceptingInterval = setInterval(() => {
    if (!this.acceptingBill) return clearInterval(this.acceptingInterval)

    const { return_int, return_code, return_message, data } = bau.acceptBill(RECVONLY)
    if (return_int < 0) return this._processOperationResult(return_code, return_message)
    if (return_code === 'HM_DEV_DOING') return
    if (return_int === 0) {
      if (data !== '0')
        this.emit('billsRead', { denomination: this.denominations[data] })
      else
        this.reject()
    }
  }, 200)
}

GenMegaValidator.prototype._open = function () {
  if (!this.device) throw new Error('No serial port name provided!')
  let { return_int, return_message } = bau.open(this.device)
  if (return_int < 0) throw new Error(return_message)

  if (typeof(this.escrowEnabled) === 'boolean') {
    const { return_int: return_intSetCapabilities, return_message: return_messageSetCapabilities } = bau.setCapabilities(this.escrowEnabled)
    if (return_intSetCapabilities < 0) throw new Error(return_messageSetCapabilities)
  } else {
    this.escrowEnabled = true
  }
}

GenMegaValidator.prototype._reset = function (should_throw=false) {
  const { return_int, return_message } = bau.reset()
  if (return_int < 0) {
    if (should_throw)
      throw new Error(return_message)
    else
      console.log(return_message)
  }
}

GenMegaValidator.prototype.reject = function () {
  const { return_int, return_code, return_message } = this.escrowEnabled ? bau.reject() : { return_int: 0, return_code: '', return_message: '' }
  if (this.escrowEnabled && return_int < 0)
    this._processOperationResult(return_int, return_message)
  else
    this.emit('billsRejected')
}

GenMegaValidator.prototype.stack = function () {
  const { return_int, return_code, return_message } = bau.stack()
  if (return_int < 0)
    this._processOperationResult(return_code, return_message)
  else
    this.emit('billsValid')
}

GenMegaValidator.prototype._status = function () {
  const { return_int, return_message, result } = bau.status()
  if (return_int < 0) console.error(return_message)
  return result
}

GenMegaValidator.prototype._processOperationResult = function (return_code, return_message) {
  if (return_code === 'HM_DEV_REJECTED_BILL') return this.emit('billsRejected')
  return this._throttledError(new Error(return_message))
}

GenMegaValidator.prototype._massageDeviceStatuses = function (obj) {
  if (obj.bCassetteAttached === '0') return ['stackerOpen']
  if (obj.bAccepting === '1') return ['billsAccepted']
  if (obj.bStacking === '1') return ['billsValid']
  if (obj.bReturning === '1') return ['billsRejected']
  if (obj.bJammed === '1') return ['jam']
  if (obj.bFailure === '1') return ['error', 'Unexpected error']
  if (obj.bIdling === '1') return ['idle']
  if (obj.bStackerFull === '1') return null //'stackerFull'
  if (obj.bPaused === '1') return null //'pause'
  if (obj.bEscrow === '1') return null // ['billsRead']
  return ['error', 'Unexpected validator state']
}

GenMegaValidator.prototype._startPolling = function () {
  this._stopPolling()
  this.pollingInterval = setInterval(() => {
    const statusp = this._massageDeviceStatuses(this._status())
    if (!statusp) return

    const [status, arg] = statusp
    if (this.currentStatus === status) return

    this.currentStatus = status
    this.emit(status, arg)
  }, POLLING_INTERVAL)
}

GenMegaValidator.prototype._stopPolling = function () {
  clearInterval(this.pollingInterval)
}

module.exports = GenMegaValidator
