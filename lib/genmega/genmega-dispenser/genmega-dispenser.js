const _ = require('lodash/fp')
const { cdu } = require('genmega')

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

BillDispenser.prototype._makeError = function _makeError ({ return_int, return_message }) {
  return return_int < 0 ? new Error(return_message) : null
}

BillDispenser.prototype._throwError = function _throwError (error) {
  if (error) throw error
}

BillDispenser.prototype._throwMakeError = function _throwMakeError ({ return_int, return_message }) {
  this._throwError(this._makeError({ return_int, return_message }))
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
  const res = cdu.status()
  return {
    error: this._makeError(res),
    statuses: res.statuses,
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
  const res = cdu.dispense(notes, this.numberOfCassettes)
  return {
    value: this._processDispenseResult(res.result, notes),
    error: this._makeError(res),
  }
}

BillDispenser.prototype._present = function () {
  return this._makeError(cdu.present())
}

BillDispenser.prototype._retract = function () {
  return this._makeError(cdu.retract())
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

      ret.error = this._makeError(cdu.shutterAction(SHUTTER_ACTION.CLOSE))

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
  this._throwMakeError(cdu.verifyLicenseKey(license))
}

BillDispenser.prototype._openSerialPort = function _openSerialPort (serialPortName) {
  if (!serialPortName) throw new Error('No serial port name provided!')
  this._throwMakeError(cdu.open(serialPortName))
}

BillDispenser.prototype._resetDevice = function _resetDevice (statuses) {
  const resetDispenser = () => this._throwMakeError(cdu.reset(INIT_MODE.NORMAL))

  const resetRecycler = () => {
    // has cash in shutter
    if (statuses.iShutterRemain === '1') {
      this._throwError(this._retract()) // retract a cash to reject bin with closing the shutter
      return this._throwMakeError(cdu.reset(INIT_MODE.NORMAL))
    }

    // has cash in stacker or transporter
    // TODO: if possible test if transporter should be handled this way
    if (statuses.iStackerRemain === '1' || statuses.iTransporterRemain === '1') {
      this._throwMakeError(cdu.forceEject()) // move the detected notes in stacker into eject-ready position
      return this._throwMakeError(cdu.reset(INIT_MODE.FORCED)) // reject the notes to reject Bin if the notes are on the feeding path
    }

    if (statuses.iShutterStatus === '1') {
      this._throwMakeError(cdu.shutterAction(SHUTTER_ACTION.CLOSE))
    }
  }

  if (this._isDispenser()) return resetDispenser()
  if (this._isRecycler()) return resetRecycler()
  throw new Error('Unknown device type!')
}

BillDispenser.prototype._setCassetteNumber = function _setCassetteNumber () {
  if (this.numberOfCassettes > MAX_SUPPORTED_CASSETTES) throw new Error('Number of cassettes not supported!')
  this._throwMakeError(cdu.setCassetteNumber(this.numberOfCassettes))
}

BillDispenser.prototype.close = function close () {
  cdu.close()
  this.initialized = false
}

BillDispenser.prototype.billsPresent = function billsPresent () {
  return Promise.resolve(true)
}

BillDispenser.prototype.waitForBillsRemoved = function waitForBillsRemoved () {
  return Promise.resolve(true)
}
