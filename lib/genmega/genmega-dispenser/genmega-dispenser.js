const genmega = require('genmega')
const _ = require('lodash/fp')
const returnValuesTable = require('../common/return-table')

const MAX_SUPPORTED_CASSETTES = 4

const LICENSE = 'foo'
const INIT_MODE = { NORMAL: 0, FORCED: 1 }
const SHUTTER_ACTION = { CLOSE: 0, OPEN: 1 }

var BillDispenser = function (config) {
  this.initialized = false
  this.initializing = false
  this.device = config.device
  this.type = 'genmega'
  this.dispenseLimit = 20
  this.deviceType = null
  this.numberOfCassettes = null
}

BillDispenser.factory = function factory (config) {
  return new BillDispenser(config)
}

module.exports = BillDispenser

BillDispenser.prototype._handleError = function _handleError (iRet) {
  throw new Error(returnValuesTable[iRet.toString()])
}

BillDispenser.prototype._setup = function _setup (data, statuses) {
  this.fiatCode = data.fiatCode
  this.deviceType = statuses.iDispenseType
  this.numberOfCassettes = _.size(data.cassettes)
}

BillDispenser.prototype._isDispenser = function _isDispenser () {
  return this.deviceType === 0
}

BillDispenser.prototype._isRecycler = function _isRecycler () {
  return this.deviceType === 1
}

BillDispenser.prototype.init = function init (data) {
  return new Promise((resolve) => {
    if (this.initializing || this.initialized) return resolve()

    this.initializing = true

    const { iRet, data: statuses } = genmega.CDUStatus()

    if (iRet < 0) {
      throw new Error(returnValuesTable[iRet.toString()])
    }

    this._setup(data, statuses)

    this._verifyLicenseKey()
    this._openSerialPort(this.device)
    this._resetDevice(statuses)
    this._setCassetteNumber()

    this.initialized = true
    this.initializing = false
  })
}

BillDispenser.prototype.dispense = function dispense (notes) {
  return new Promise((resolve) => {
    let error = null
    if (this._isDispenser()) {
      const { iRet, data } = genmega.CDUDispense(notes)
      if (iRet < 0) {
        this.close()
        error = new Error(returnValuesTable[iRet.toString()])
        error.statusCode = 570
        return resolve({ value: this._processDispenseResult(data), error })
      }
      return resolve({ value: this._processDispenseResult(data) })
    }
    if (this._isRecycler()) {
      const { iRet, data } = genmega.CDUDispense(notes)
      if (iRet < 0) {
        this.close()
        error = new Error(returnValuesTable[iRet.toString()])
        error.statusCode = 570
        return resolve({ value: this._processDispenseResult(data), error })
      }
      const dispenseResult = { value: this._processDispenseResult(data) }
      const { iRet: iRetPreset } = genmega.CDUPresent()
      if (iRetPreset < 0) {
        error = new Error(returnValuesTable[iRet.toString()])
      }
      let interval = setTimeout(() => {
        const { iRet: iRetStatus, data: statuses } = genmega.CDUStatus()
        if (iRetStatus < 0) {
          error = new Error(returnValuesTable[iRet.toString()])
        }
        if (statuses.iShutterRemain) {
          const { iRet: iRetRetract } = genmega.CDURetract()
          if (iRetRetract < 0) {
            clearInterval(interval)
            // TODO: bill were not retrieve what should be the return?
            resolve({ value: {}, error })
          }
        }
        const { iRetShutter } = genmega.CDUShutterAction(SHUTTER_ACTION.CLOSE)
        if (iRetShutter < 0) {
          error = new Error(returnValuesTable[iRet.toString()])
        }
        resolve({ value: dispenseResult, error })
      }, 30000)
    }
    throw new Error('Unknown device type!')
  })
}

BillDispenser.prototype._processDispenseResult = function _processDispenseResult (data) {
  // TODO: process the data value
}

BillDispenser.prototype._verifyLicenseKey = function _verifyLicenseKey () {
  const { iRet } = genmega.CDUVerifyLicenseKey(LICENSE)
  if (iRet < 0) {
    throw new Error(returnValuesTable[iRet.toString()])
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
