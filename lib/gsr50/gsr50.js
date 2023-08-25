const uuid = require('uuid')
const { EventEmitter } = require('events')
const util = require('util')
const got = require('got')
const _ = require('lodash/fp')
const pDelay = require('delay')
const WebSocketServer = require('ws').Server

const BN = require('../bn')

const diff = require('./diff')

const GSR_SERVER = 'localhost'
const RESET_MODES = {
  Mechanical: 0,
  Jam: 1,
  Soft: 2,
  Reject: 3,
  RejectReset: 4
}

const CASH_UNIT_MODES = {
  None: 0,
  CashIn: 1,
  Dispense: 2,
  Recycle: 3
}

const CASH_UNIT_POSITIONS = {
  none: 0,
  stacker1: 1,
  stacker2: 2,
  stacker3: 3,
  stacker4: 4,
  cashbox: 5,
  counterfeit: 6,
  retract: 7,
  cassette1: 8,
  cassette2: 9,
  cassette3: 10,
  cassette4: 11,
  cassette5: 12,
  cassette6: 13,
  cassette7: 14,
  cassette8: 15,
  cassettea: 16,
  reject: 17,
  rejecta: 18,
  rejectb: 19,
  rejectc: 20,
  inout: 21,
  escrow: 22,
  escrow2: 23,
  capture: 24,
  stacker1f: 25,
  stacker1r: 26,
  stacker2f: 27,
  stacker2r: 28,
  stacker3f: 29,
  stacker3r: 30,
  cashbox1: 31,
  cashbox2: 32,
  cashbox3: 33,
  exceptbox1: 34,
  exceptbox2: 35,
  bin1: 36,
  bin2: 37,
  bin3: 38,
  bin4: 39,
  bin5: 40,
  bin6: 41,
  bin7: 42,
  bin8: 43,
  bin9: 44,
  bin10: 45,
  bin11: 46,
  bin12: 47,
  bin13: 48,
  bin14: 49,
  bin15: 50,
  bin16: 51,
  collection: 52,
  reservoir: 53
}

const CASH_UNIT_POSITIONS_BY_KEY = _.invert(CASH_UNIT_POSITIONS)

const CASH_UNIT_STATUS = {
  OK: 0,
  Inoperational: 5,
  Missing: 6,
  ValueUnavailable: 7,
  ReferenceUnavailable: 8,
  Manipulated: 9
}

const UNIT_EVENTS = {
  None: 0,
  SafeDoorOpen: 1,
  SafeDoorClosed: 2,
  CashUnitThreshold: 3,
  CashUnitEjected: 4,
  CashUnitInserted: 5,
  MaintenanceRequired: 6,
  CashUnitInfoChanged: 7,
  TellerInfoChanged: 8,
  DelayedDispense: 9,
  StartDispense: 10,
  CashUnitError: 11,
  ItemsTaken: 12,
  PartialDispense: 13,
  SubDispenseOK: 14,
  InputRefuse: 15,
  ItemsPresented: 16,
  ItemsInserted: 17,
  CountsChanged: 18,
  IncompleteDispense: 19,
  NoteError: 20,
  SubCashIn: 21,
  MediaDetected: 22,
  InputP6: 23,
  InfoAvailable: 24,
  InsertItems: 25,
  DevicePosition: 26,
  PowerSaveChange: 27,
  IncompleteReplenish: 28,
  HardwareError: 29,
  AppDisconnect: 30,
  UndeliverableMessage: 31,
  VersionError: 32,
  DeviceStatus: 33,
  SoftwareError: 34,
  UserError: 35,
  LockRequested: 36,
  FraudAttempt: 37,
  NoteData: 38,
  PickPresentedItems: 39,
  BVOpened: 40,
  BVClosed: 41,
  FWLogAvailable: 42,
  FWUploadStart: 43,
  FWUploadEnd: 44,
  Power24VLost: 45,
  Power24VAdded: 46,
  TimeoutOccurred: 47,
  CurrencyDetected: 48
}

const OPERATION_TYPE = {
  MR: 0, // Mechanical Reset
  IV: 2, // Accept Cash
  DP: 3, // Deposit
  WC: 4, // Dispense
  S1: 8, // Replenish
  WP: 10, // No Info
  BK: 0xFF // Rollback
}

var instance = null

const Gsr50 = function (config) {
  this.name = 'GSR50'
  this.config = config

  // Bill validator variables
  this.fiatCode = null
  this.denominations = null
  this.denomCodeSettings = null
  this.allNoteIds = null
  this.cassettesDenomIds = null

  // Bill dispenser variables
  this.initializing = null
  this.initialized = null
  this.cassettes = null
  this.dispenseLimit = 20
}

util.inherits(Gsr50, EventEmitter)
Gsr50.factory = function factory (config) {
  if (!instance) {
    instance = new Gsr50(config)
  }
  return instance
}

Gsr50.prototype.isCashRecycler = true

Gsr50.prototype.setFiatCode = function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
}

Gsr50.prototype.processUnitEvent = function processUnitEvent(data) {
  if (data.Type === UNIT_EVENTS.CashUnitEjected && _.includes(CASH_UNIT_POSITIONS.cashbox1)(_.map(it => it.Position)(data.CashUnits))) {
    this.emit('stackerOpen')
  }

  if (data.Type === UNIT_EVENTS.CashUnitInserted && _.includes(CASH_UNIT_POSITIONS.cashbox1)(_.map(it => it.Position)(data.CashUnits))) {
    this.emit('stackerClosed')
  }

  if (data.Type === UNIT_EVENTS.CashUnitEjected || data.Type === UNIT_EVENTS.CashUnitInserted) {
    this.emit('actionRequiredMaintenance')
  }
}

Gsr50.prototype.run = function run (cb, cassettes, stackers) {
  const self = this

  this.wss = new WebSocketServer({ port: 9001, host: 'localhost' })

  this.wss.on('connection', function (ws) {
    self.ws = ws
    ws.on('message', function (data) {
      var res = JSON.parse(data)

      if (res.Event === 'UnitEvent') self.processUnitEvent(res.Data)
    })

    ws.on('error', err => {
      console.log('websocket error', err)
    })
  })

  return this.connect()
    .then(() => this.getDeviceState())
    .then(() => this.setDeviceCashUnits(cassettes, stackers))
    .then(() => cb())
    .catch(err => cb(err))
}

Gsr50.prototype.connect = function connect (currentRetry = 0) {
  console.log("gsr50.js:Gsr50.connect():trying to connect")
  const retry = () => {
    const nextAttemptTime = _.clamp(0, 16000)(Math.pow(2, currentRetry) * 1000)
    console.log(`Couldn't establish connection with the GSR50, retrying in ${nextAttemptTime / 1000} seconds...`)
    return pDelay(nextAttemptTime).then(() => this.connect(currentRetry + 1))
  }
  return got.post(`http://${GSR_SERVER}:9000/connect`, { timeout: 2000 })
    .then(promiseResult => {
      console.log("gsr50.js:Gsr50.connect():result")
      const r = JSON.parse(promiseResult.body)
      return [promiseResult, r]
    })
    .then(([promiseResult, r])=> (!r.Success && r.ErrorCode !== '-1') ? retry() : resolveOrThrow(promiseResult, '/connect'))
    .catch(e => {
      console.log("gsr50.js:Gsr50.connect():error")
      if (e.code === 'ECONNREFUSED') return retry()
      throw e
    })
}

Gsr50.prototype.getDeviceState = function getDeviceState () {
  return got.get(`http://${GSR_SERVER}:9000/getStatus`)
    .then(r => resolveOrThrow(r, '/getStatus'))
    .then(res => {
      this.denominations = _.reduce(
        (acc, value) => Object.assign(acc, {
          [value.Denomination]: {
            denomination: value.Denomination,
            fiatCode: value.CurrencyCode,
            noteId: value.NoteId // TODO: Is this needed?
          }
        }),
        {},
        res.SupportedCurrencies || []
      )
    })
}

Gsr50.prototype.getDeviceCashUnits = function getDeviceCashUnits () {
  return got.get(`http://${GSR_SERVER}:9000/getCashUnits`)
    .then(r => resolveOrThrow(r, '/getCashUnits'))
}

Gsr50.prototype.setDeviceCashUnits = function setDeviceCashUnits (cassettes, stackers) {
  return this.getDeviceCashUnits()
    .then(res => {
      let units = {
        cashbox: {
          Number: 8,
          Mode: CASH_UNIT_MODES.CashIn,
          Position: CASH_UNIT_POSITIONS.cashbox1,
          Currency: {
            CurrencyCode: this.fiatCode
          }
        }
      }
    
      if (cassettes) {
        units = _.reduce(
          (acc, value) => {
            return Object.assign(acc, {
              [`cassette${value + 1}`]: {
                Number: 7 + value,
                Mode: CASH_UNIT_MODES.Dispense,
                Position: CASH_UNIT_POSITIONS.cassette1 + value,
                Count: cassettes[value].count,
                Currency: {
                  CurrencyCode: this.fiatCode,
                  Denomination: cassettes[value].denomination.toNumber()
                }
              }
            })
          },
          units,
          _.range(0, _.size(cassettes))
        )
      }
    
      if (stackers) {
        units = _.reduce(
          (acc, value) => {
            return Object.assign(acc, {
              [value.name]: {
                Number: value.number,
                Mode: CASH_UNIT_MODES.Recycle,
                Position: CASH_UNIT_POSITIONS[value.name],
                Count: value.count,
                Currency: {
                  CurrencyCode: this.fiatCode,
                  Denomination: value.denomination.toNumber()
                }
              },
              [value.name]: {
                Number: value.number,
                Mode: CASH_UNIT_MODES.Recycle,
                Position: CASH_UNIT_POSITIONS[value.name],
                Count: value.count,
                Currency: {
                  CurrencyCode: this.fiatCode,
                  Denomination: value.denomination.toNumber()
                }
              }
            })
          },
          units,
          stackers
        )
      }

      return units
    })
    .then(cashUnits => got.post(`http://${GSR_SERVER}:9000/setCashUnits`, { body: JSON.stringify(cashUnits) }))
    .then(r => resolveOrThrow(r, '/setCashUnits'))
}

Gsr50.prototype.reset = function reset (mode) {
  return got.post(`http://${GSR_SERVER}:9000/reset`, {
    body: JSON.stringify({
      Type: RESET_MODES[mode]
    })
  })
    .then(r => resolveOrThrow(r, '/reset'))
}

Gsr50.prototype.cashRollback = function cashRollback () {
  return got.post(`http://${GSR_SERVER}:9000/rollback`)
    .then(r => resolveOrThrow(r, '/rollback'))
}

Gsr50.prototype.lightOn = function lightOn () {
  console.log('GSR50: lightOn')
}

Gsr50.prototype.lightOff = function lightOff () {
  console.log('GSR50: lightOff')
}

// TODO: There's nothing like open/close shutter for GSR50. Find a way to simulate that behavior
Gsr50.prototype.enable = function enable () {
}

Gsr50.prototype.reenable = function reenable () {
  console.log('GSR50: enabling')
  return this.cashCount()
}

Gsr50.prototype.disable = function disable () {
  console.log('GSR50: disabling')
  this.waitingForCashEnd = false
  return this.send('acceptCashEnd')
}

Gsr50.prototype.highestBill = function highestBill (fiat) {
  const bills = _.values(this.denominations)
  const _filtered = bills.filter(bill => fiat.gte(bill.denomination))
  const filtered = _filtered.map(it => it.denomination)
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
}

Gsr50.prototype.lowestBill = function lowestBill (fiat) {
  const bills = _.values(this.denominations)
  const _filtered = bills.filter(bill => fiat.lte(bill.denomination))
  const filtered = _filtered.map(it => it.denomination)
  if (_.isEmpty(filtered)) return BN(_.min(bills))
  return BN(_.min(filtered))
}

Gsr50.prototype.hasDenominations = function hasDenominations () {
  return this.denominations !== null
}

Gsr50.prototype.reject = function reject () {
  console.log('GSR50: rolling back bills')
  return this.cashRollback()
}

Gsr50.prototype.cashCount = function cashCount () {
  // this.emit('billsAccepted')
  let list = []
  let refusedNotes = 0
  return got.post(`http://${GSR_SERVER}:9000/acceptCashStart`)
    .then(r => resolveOrThrow(r, '/acceptCashStart'))
    .then(res => {
      const [RefusedNotes, AcceptedBills] = res
      refusedNotes = RefusedNotes
      if (!_.isNil(AcceptedBills)) {
        AcceptedBills.forEach(ab => {
          let destinationUnit = CASH_UNIT_POSITIONS_BY_KEY[ab.Destination]
          destinationUnit = destinationUnit === 'cashbox1' ? 'cashbox' : destinationUnit

          list.push({
            denomination: ab.Denomination,
            destinationUnit
          })

          if (!_.isNil(destinationUnit)) destinationUnit.count++
        })
      }
      return list
    })
    .then(() => {
      if (list.length) {
        this.emit('billsRead', list)
        return list
      } else if(refusedNotes) {
        return this.cashCount()
      }
    })
}

Gsr50.prototype._setup = function _setup (data) {
  this.fiatCode = data.fiatCode
  this.cassettes = data.cassettes
  this.originalCassettes = data.originalCassettes
  this.stackers = data.stackers
  this.originalStackers = data.originalStackers
}

Gsr50.prototype.init = function init (data) {
  var self = this

  return new Promise(resolve => {
    if (this.initializing || this.initialized) {
      resolve()
      return
    }

    this.initializing = true
    this._setup(data)

    setTimeout(function () {
      self.initialized = true
      self.initializing = false
      resolve()
    }, 1000)
  })
}

Gsr50.prototype.waitForBillsRemoved = function waitForBillsRemoved () {
  return pDelay(2000).then(_.stubTrue)
}

Gsr50.prototype.billsPresent = function billsPresent () {
  return pDelay(2000).then(_.stubFalse)
}

Gsr50.prototype.dispense = function dispense (notes) {
  const billsToDispense = _.map.convert({cap: false})((it, idx) => ({ Denomination: it.denomination.toNumber(), Amount: notes[idx], FiatCode: this.fiatCode }), _.concat(this.originalCassettes, this.originalStackers))
  const filteredBills = _.filter(it => it.Amount > 0)(billsToDispense)

  return this.getDeviceCashUnits()
    .then(preCashUnits => Promise.all([preCashUnits, got.post(`http://${GSR_SERVER}:9000/dispense`, {
      body: JSON.stringify({
        BillsToDispense: filteredBills
      })
    })]))
    .then(([pre, r]) => Promise.all([pre, r, resolveOrThrow(r, '/dispense')]))
    .then(([pre, r, value]) => Promise.all([pre, r, value, this.getDeviceCashUnits()]))
    .then(([preCashUnits, r, [_CashUnits, billsDispensed], postCashUnits]) => {
      const res = JSON.parse(promiseResult.body)

      let CashUnits
      let hasError = (!_CashUnits?.length && !!billsDispensed?.length) || !res.Success
      if (hasError) {
        CashUnits = diff(preCashUnits, postCashUnits, billsDispensed)
      } else {
        CashUnits = _CashUnits
      }

      const units = _.map(it => ({ name: it.name, dispensed: 0, rejected: 0 }))(_.concat(this.cassettes, this.stackers))

      _.forEach(it => {
        const unit = _.find(ite => ite.name === CASH_UNIT_POSITIONS_BY_KEY[it.Position])(units)
        if (!unit) return
        unit.dispensed += it.DispensedCount
        unit.rejected += it.RejectCount
      })(CashUnits)

      return pDelay(2000).then(() => ({
        error: hasError ? new Error('Bad counts on the recycler') : null,
        value: _.map(_.pick(['dispensed', 'rejected']))(units)
      }))
    })
}

Gsr50.prototype.deposit = function deposit () {
  this.emit('billsValid')
  return got.post(`http://${GSR_SERVER}:9000/acceptCashEnd`)
    .then(r => resolveOrThrow(r, '/acceptCashEnd'))
}

Gsr50.prototype.stack = function stack () {
  return this.deposit()
}

Gsr50.prototype.emptyUnit = function emptyUnit () {
  return got.post(`http://${GSR_SERVER}:9000/emptyUnit`)
    .then(r => resolveOrThrow(r, '/emptyUnit'))
    .then(() => this.getDeviceCashUnits())
    .then((_units = []) => {
      const units = _.reduce(
        (acc, value) => Object.assign(acc, { [_.includes('Cashbox', value.Position) ? 'cashbox' : CASH_UNIT_POSITIONS_BY_KEY[value.Position]]: value.Count }),
        {},
        _units
      )

      return { units, fiatCode: this.fiatCode }
    })
}

Gsr50.prototype.refillUnit = function refillUnit () {
  return got.post(`http://${GSR_SERVER}:9000/refillUnit`)
    .then(r => resolveOrThrow(r, '/refillUnit'))
    .then(() => this.getDeviceCashUnits())
    .then((units = []) => ({
      units: _.reduce(
        (acc, value) => Object.assign(acc, { [_.includes('Cashbox', value.Position) ? 'cashbox' : CASH_UNIT_POSITIONS_BY_KEY[value.Position]]: value.Count }),
        {},
        units
      )
    }))
}

Gsr50.prototype.updateCounts = function updateCounts (newCounts) {
  console.log('GSR50: Update Counts runnning')
  _.forEach(it => it.count = _.defaultTo(it.count, newCounts[it.name]))(this.cassettes)
  _.forEach(it => it.count = _.defaultTo(it.count, newCounts[it.name]))(this.stackers)

  return this.setDeviceCashUnits(this.cassettes, this.stackers)
}

Gsr50.prototype.send = function send (message) {
  return new Promise((resolve, reject) => {
    if (!this.ws) {
      reject('gsr50 not connected')
    }

    this.ws.send(message, function (err) {
      if (err) {
        reject('gsr50 - failure sending message')
      }
      resolve()
    })
  })
}

function resolveOrThrow (promiseResult, route) {
  const res = JSON.parse(promiseResult.body)
  try {
    if (!res.Success) {
      throw new Error(`An error occurred in GSR50's ${route} route (error code ${res.ErrorCode}). More information about the error: ${JSON.stringify(res.ErrorInfo)}`)
    }
  } catch (e) {
    console.error(e)
  } finally {
    return res.Value
  }
}

module.exports = Gsr50
