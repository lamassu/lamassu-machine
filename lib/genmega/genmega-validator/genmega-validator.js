const { EventEmitter } = require('events')
const util = require('util')
const _ = require('lodash/fp')
const genmega = require('genmega')

const BN = require('../../bn')
const returnValuesTable = require('../common/return-table')

const POLLING_INTERVAL = 1000

const HM_DEV_DOING = 3

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
  genmega.BAUClose()
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

  const { iRet, data } = genmega.BAUGetSupportCurrency()
  // For now only supports one currency based on the current firmware
  if (iRet > 1) // count of currencies supported
    throw new Error('Multiple currencies detected!')

  const [fiatCode, ...denominations] = data.split(',')

  if (fiatCode !== this.fiatCode)
    throw new Error('Supported fiat currency different from requested currency')

  this.denominations = Object.fromEntries(denominations.map((denom, idx) => [idx+1, Number(denom)]))
}

GenMegaValidator.prototype._setEnabledDenominations = function () {
  //this._reset() // TODO(siiky): is this necessary?

  const { iRet } = genmega.BAUSetEnableDenom(`${this.fiatCode},1111111`)
  // iRet: (-2) Function of the previous operation is not completed
  // Does this mean that the device only accepts one operation at a time?
  if (iRet < 0) throw new Error(returnValuesTable[iRet])
}

GenMegaValidator.prototype.disable = function () {
  if (!this.acceptingBill) return
  this.acceptingBill = false
  // TODO: What to do if we have a note read already?
  const { iRet, data } = genmega.BAUCancel()
  if (iRet === 0 && data && data !== '0')
    this.reject()
}

GenMegaValidator.prototype.enable = function enable () {
  const { iRet, data } = genmega.BAUAcceptBill(SENDONLY)
  if (iRet < 0) return this._processOperationResult(iRet)

  this.acceptingBill = true

  this.acceptingInterval = setInterval(() => {
    if (!this.acceptingBill) return clearInterval(this.acceptingInterval)

    const { iRet, data } = genmega.BAUAcceptBill(RECVONLY)
    if (iRet < 0) return this._processOperationResult(iRet)
    if (iRet === HM_DEV_DOING) return
    if (iRet === 0) {
      if (data !== '0')
        this.emit('billsRead', { denomination: this.denominations[data] })
      else
        this.reject()
    }
  }, 200)
}

GenMegaValidator.prototype._open = function () {
  if (!this.device) throw new Error('No serial port name provided!')
  let { iRet } = genmega.BAUOpen(this.device)
  if (iRet < 0) throw new Error(returnValuesTable[iRet])

  if (typeof(this.escrowEnabled) === 'boolean') {
    iRet = genmega.BAUSetCapabilities(this.escrowEnabled).iRet
    if (iRet < 0) throw new Error(returnValuesTable[iRet])
    this.escrowEnabled = this.escrowEnabled || true
  }
}

GenMegaValidator.prototype._reset = function (should_throw=false) {
  const { iRet } = genmega.BAUReset()
  if (iRet < 0) {
    const msg = returnValuesTable[iRet]
    if (should_throw)
      throw new Error(msg)
    else
      console.log(msg)
  }
}

GenMegaValidator.prototype.reject = function () {
  let iRet = this.escrowEnabled ? genmega.BAUReject().iRet : 0
  if (this.escrowEnabled && iRet < 0) {
    console.error(iRet)
    this._processOperationResult(iRet)
  } else {
    this.emit('billsRejected')
  }
}

GenMegaValidator.prototype.stack = function () {
  const { iRet } = genmega.BAUStack()
  if (iRet < 0) {
    console.error(iRet)
    this._processOperationResult(iRet)
  } else {
    this.emit('billsValid')
  }
}

GenMegaValidator.prototype._status = function () {
  const { iRet, result } = genmega.BAUStatus()
  if (iRet < 0) console.error(returnValuesTable[iRet])
  return result
}

GenMegaValidator.prototype._processOperationResult = function (iRet) {
  if (iRet === -13) return this.emit('billsRejected')
  return this._throttledError(new Error(returnValuesTable[iRet.toString()]))
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
