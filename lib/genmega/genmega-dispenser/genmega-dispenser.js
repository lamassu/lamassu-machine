const _ = require('lodash/fp')
const genmega = require('genmega')
const { return_codes } = genmega

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

BillDispenser.prototype._makeError = function _makeError (iRet) {
  return iRet < 0 ?
    new Error(return_codes[iRet]) :
    null
}

BillDispenser.prototype._throwError = function _throwError (error) {
  if (error) throw error
}

BillDispenser.prototype._throwMakeError = function _throwMakeError (iRet) {
  this._throwError(this._makeError(iRet))
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

BillDispenser.prototype._status = function _status () {
  const { iRet, result: statuses } = genmega.CDUStatus()
  return {
    error: this._makeError(iRet),
    statuses,
  }
}

BillDispenser.prototype.init = function init (data) {
  return new Promise((resolve) => {
    if (this.initializing || this.initialized) return resolve()

    this.initializing = true

    this._verifyLicenseKey(this.license)
    this._openSerialPort(this.device)

    const { error, statuses } = this._status()
    this._throwError(error)

    this._setup(data, statuses)

    this._resetDevice(statuses)
    this._setCassetteNumber()

    this.initialized = true
    this.initializing = false
  })
}

BillDispenser.prototype._dispense = function (notes) {
  const { iRet, result } = genmega.CDUDispense(notes, this.numberOfCassettes)
  return {
    value: this._processDispenseResult(result, notes),
    error: this._makeError(iRet),
  }
}

BillDispenser.prototype._present = function () {
  return this._makeError(genmega.CDUPresent().iRet)
}

BillDispenser.prototype._retract = function () {
  return this._makeError(genmega.CDURetract().iRet)
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
      const { error: statusError, statuses } = this._status()
      if (ret.error = statusError) {
        clearInterval(timeout)
        return resolve(ret)
      }

      // bills were not retrieved
      if (statuses.iShutterRemain === '1') {
        ret.error = this._retract()
        if (ret.error) {
          clearInterval(timeout)
          return resolve(ret)
        }
      }

      const { iRet: iRetShutter } = genmega.CDUShutterAction(SHUTTER_ACTION.CLOSE)
      ret.error = this._makeError(iRetShutter)

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
  this._throwMakeError(genmega.CDUVerifyLicenseKey(license).iRet)
}

BillDispenser.prototype._openSerialPort = function _openSerialPort (serialPortName) {
  if (!serialPortName) throw new Error('No serial port name provided!')
  this._throwMakeError(genmega.CDUOpen(serialPortName).iRet)
}

BillDispenser.prototype._resetDevice = function _resetDevice (statuses) {
  if (this._isDispenser())
    return this._throwMakeError(genmega.CDUReset(INIT_MODE.NORMAL).iRet)

  if (this._isRecycler()) {
    // has cash in shutter
    if (statuses.iShutterRemain === '1') {
      this._throwError(this._retract()) // retract a cash to reject bin with closing the shutter
      return this._throwMakeError(genmega.CDUReset(INIT_MODE.NORMAL).iRet)
    }

    // has cash in stacker or transporter
    // TODO: if possible test if transporter should be handled this way
    if (statuses.iStackerRemain === '1' || statuses.iTransporterRemain === '1') {
      this._throwMakeError(genmega.CDUForceEject().iRet) // move the detected notes in stacker into eject-ready position
      return this._throwMakeError(genmega.CDUReset(INIT_MODE.FORCED).iRet) // reject the notes to reject Bin if the notes are on the feeding path
    }

    if (statuses.iShutterStatus === '1') {
      this._throwMakeError(genmega.CDUShutterAction(SHUTTER_ACTION.CLOSE).iRet)
    }

    return
  }

  throw new Error('Unknown device type!')
}

BillDispenser.prototype._setCassetteNumber = function _setCassetteNumber () {
  if (this.numberOfCassettes > MAX_SUPPORTED_CASSETTES) throw new Error('Number of cassettes not supported!')
  this._throwMakeError(genmega.CDUSetCassetteNumber(this.numberOfCassettes).iRet)
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
