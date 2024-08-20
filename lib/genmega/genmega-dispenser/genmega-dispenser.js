const genmega = require('genmega')
const _ = require('lodash/fp')
const returnValuesTable = require('../common/return-table')

const MAX_SUPPORTED_CASSETTES = 4

const INIT_MODE = { NORMAL: 0, FORCED: 1 }
const SHUTTER_ACTION = { CLOSE: 0, OPEN: 1 }

var BillDispenser = function (config) {
  this.initialized = false
  this.initializing = false
  this.device = config.device
  this.license = config.license
  this.deviceType = null
  this.numberOfCassettes = null
}

BillDispenser.factory = function factory (config) {
  return new BillDispenser(config)
}

module.exports = BillDispenser

BillDispenser.prototype._handleError = function _handleError (iRet) {
  throw new Error(returnValuesTable[iRet])
}

BillDispenser.prototype._setup = function _setup (data, statuses) {
  this.fiatCode = data.fiatCode
  this.deviceType = statuses.iDispenseType
  this.numberOfCassettes = _.size(data.cassettes)
}

BillDispenser.prototype._isDispenser = function _isDispenser () {
  return this.deviceType === '0'
}

BillDispenser.prototype._isRecycler = function _isRecycler () {
  return this.deviceType === '1'
}

BillDispenser.prototype.init = function init (data) {
  return new Promise((resolve) => {
    if (this.initializing || this.initialized) return resolve()

    this.initializing = true

    this._verifyLicenseKey(this.license)
    this._openSerialPort(this.device)

    const { iRet, result: statuses } = genmega.CDUStatus()

    if (iRet < 0) {
      throw new Error(returnValuesTable[iRet])
    }

    this._setup(data, statuses)

    this._resetDevice(statuses)
    this._setCassetteNumber()

    this.initialized = true
    this.initializing = false
  })
}

BillDispenser.prototype._dispense = function (notes) {
  const { iRet, result } = genmega.CDUDispense(notes, this.numberOfCassettes)
  const ret = { value: this._processDispenseResult(result, notes) }
  if (iRet < 0) ret.error = new Error(returnValuesTable[iRet])
  return ret
}

BillDispenser.prototype._present = function () {
  const { iRet } = genmega.CDUPresent()
  return (iRet < 0) ?
    new Error(returnValuesTable[iRet]) :
    null
}

BillDispenser.prototype.dispense = function dispense (notes, _currentBatch, _batchAmount) {
  const asDispenser = resolve => {
    const ret = this._dispense(notes)
    if (ret.error) {
      this.close()
      return resolve(ret)
    }
  }

  const asRecycler = resolve => {
    const ret = this._dispense(notes)
    if (ret.error) {
      this.close()
      return resolve(ret)
    }

    ret.error = this._present()
    if (ret.error) return resolve(ret)

    const timeout = setTimeout(() => {
      const { iRet: iRetStatus, result: statuses } = genmega.CDUStatus()
      if (iRetStatus < 0) {
        ret.error = new Error(returnValuesTable[iRetStatus])
        clearInterval(timeout)
        return resolve(ret)
      }

      // bills were not retrieved
      if (statuses.iShutterRemain === '1') {
        const { iRet: iRetRetract } = genmega.CDURetract()
        if (iRetRetract < 0) {
          ret.error = new Error(returnValuesTable[iRetRetract])
          clearInterval(timeout)
          return resolve(ret)
        }
      }

      const { iRetShutter } = genmega.CDUShutterAction(SHUTTER_ACTION.CLOSE)
      if (iRetShutter < 0)
        ret.error = new Error(returnValuesTable[iRetShutter])

      clearInterval(timeout)
      return resolve(ret)
    }, 30000)
  }

  const asUnknown = (_resolve, reject) =>
    reject(new Error('Unknown device type!'))

  return new Promise(
    this._isDispenser() ? asDispenser :
    this._isRecycler() ? asRecycler :
    asUnknown
  )
}

BillDispenser.prototype._processDispenseResult = function _processDispenseResult (data, notes) {
  if (_.isEmpty(data)) {
    return _.map(it => ({ dispensed: 0, rejected: Number(it) }))(notes)
  }
  return _.map(it => ({ dispensed: Number(it.iDispensedCount), rejected: Number(it.iRejectedCount) }))(data)
}

BillDispenser.prototype._verifyLicenseKey = function _verifyLicenseKey (license) {
  const { iRet } = genmega.CDUVerifyLicenseKey(license)
  if (iRet < 0) {
    throw new Error(returnValuesTable[iRet])
  }
}

BillDispenser.prototype._openSerialPort = function _openSerialPort (serialPortName) {
  if (!serialPortName) throw new Error('No serial port name provided!')
  const { iRet } = genmega.CDUOpen(serialPortName)
  if (iRet < 0) {
    this._handleError(iRet)
  }
}

BillDispenser.prototype._resetDevice = function _resetDevice (statuses) {
  if (this._isDispenser()) {
    const { iRet } = genmega.CDUReset(INIT_MODE.NORMAL)
    if (iRet < 0) this._handleError(iRet)
    return
  }
  if (this._isRecycler()) {
    // has cash in shutter
    if (statuses.iShutterRemain === '1') {
      const { iRet: iRetRetract } = genmega.CDURetract() // retract a cash to reject bin with closing the shutter
      const { iRet: iRetReset } = genmega.CDUReset(INIT_MODE.NORMAL)
      if (iRetRetract < 0) this._handleError(iRetRetract)
      if (iRetReset < 0) this._handleError(iRetReset)
      return
    }
    // has cash in stacker or transporter
    // TODO: if possible test if transporter should be handled this way
    if (statuses.iStackerRemain === '1' || statuses.iTransporterRemain === '1') {
      const { iRet: iRetForceEject } = genmega.CDUForceEject() // move the detected notes in stacker into eject-ready position
      const { iRet: iRetReset } = genmega.CDUReset(INIT_MODE.FORCED) // reject the notes to reject Bin if the notes are on the feeding path
      if (iRetForceEject < 0) this._handleError(iRetForceEject)
      if (iRetReset < 0) this._handleError(iRetReset)
      return
    }
    if (statuses.iShutterStatus === '1') {
      const { iRet } = genmega.CDUShutterAction(SHUTTER_ACTION.CLOSE)
      if (iRet < 0) this._handleError(iRet)
    }
  }
  throw new Error('Unknown device type!')
}

BillDispenser.prototype._setCassetteNumber = function _setCassetteNumber () {
  if (this.numberOfCassettes > MAX_SUPPORTED_CASSETTES) throw new Error('Number of cassettes not supported!')
  const { iRet } = genmega.CDUSetCassetteNumber(this.numberOfCassettes)
  if (iRet < 0) {
    this._handleError(iRet)
  }
}

BillDispenser.prototype.close = function close () {
  genmega.CDUClose()
  this.initialized = false
}

BillDispenser.prototype.billsPresent = function billsPresent () {
  return Promise.resolve(true)
}

BillDispenser.prototype.waitForBillsRemoved = function waitForBillsRemoved () {
  return Promise.resolve(true)
}
