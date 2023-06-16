const uuid = require('uuid')
const { EventEmitter } = require('events')
const util = require('util')
const got = require('got')
const _ = require('lodash/fp')
const pDelay = require('delay')
var WebSocketServer = require('ws').Server

const BN = require('../bn')

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
  None: 0,
  Stacker1: 1,
  Stacker2: 2,
  Stacker3: 3,
  Stacker4: 4,
  CashBox: 5,
  Counterfeit: 6,
  Retract: 7,
  Cassette1: 8,
  Cassette2: 9,
  Cassette3: 10,
  Cassette4: 11,
  Cassette5: 12,
  Cassette6: 13,
  Cassette7: 14,
  Cassette8: 15,
  CassetteA: 16,
  Reject: 17,
  RejectA: 18,
  RejectB: 19,
  RejectC: 20,
  INOUT: 21,
  Escrow: 22,
  Escrow2: 23,
  Capture: 24,
  Stacker1F: 25,
  Stacker1R: 26,
  Stacker2F: 27,
  Stacker2R: 28,
  Stacker3F: 29,
  Stacker3R: 30,
  CashBox1: 31,
  CashBox2: 32,
  CashBox3: 33,
  ExceptBox1: 34,
  ExceptBox2: 35,
  Bin1: 36,
  Bin2: 37,
  Bin3: 38,
  Bin4: 39,
  Bin5: 40,
  Bin6: 41,
  Bin7: 42,
  Bin8: 43,
  Bin9: 44,
  Bin10: 45,
  Bin11: 46,
  Bin12: 47,
  Bin13: 48,
  Bin14: 49,
  Bin15: 50,
  Bin16: 51,
  Collection: 52,
  Reservoir: 53
}

const CASH_UNIT_STATUS = {
  OK: 0,
  Inoperational: 5,
  Missing: 6,
  ValueUnavailable: 7,
  ReferenceUnavailable: 8,
  Manipulated: 9
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
  this.dispenseLimit = 200
}

util.inherits(Gsr50, EventEmitter)
Gsr50.factory = function factory (config) {
  if (!instance) {
    instance = new Gsr50(config)
  }
  return instance
}

Gsr50.prototype.setFiatCode = function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
}

Gsr50.prototype.processUnitEvent = function processUnitEvent(data) {
  if (data.Type === 'CashUnitEjected' && _.includes(CASH_UNIT_POSITIONS.CashBox1)(_.map(it => it.Position)(data.CashUnits))) {
    this.emit('stackerOpen')
  }

  if (data.Type === 'CashUnitInserted' && _.includes(CASH_UNIT_POSITIONS.CashBox1)(_.map(it => it.Position)(data.CashUnits))) {
    this.emit('stackerClosed')
  }
}

Gsr50.prototype.run = function run (cb, cassettes, stackers) {
  this.wss = new WebSocketServer({ port: 9001, host: 'localhost' })

  this.wss.on('connection', function (ws) {
    ws.on('message', function (data) {
      var res = JSON.parse(data)

      if (res.Event === 'UnitEvent') this.processUnitEvent(res.Data)
    })

    ws.on('error', err => {
      console.log('websocket error', err)
    })
  })

  return this.connect()
    .then(() => this.getDeviceState())
    .then(() => this.getDeviceCashUnits())
    .then(() => this.setDeviceCashUnits(cassettes, stackers))
    .then(() => cb())
    .catch(err => cb(err))
}

Gsr50.prototype.connect = function connect (currentRetry = 0) {
  return got.post('http://localhost:9000/connect')
    .then(r => resolveOrThrow(r, '/connect'))
    .catch(e => {
      if (e.code === 'ECONNREFUSED') {
        const nextAttemptTime = _.clamp(0, 16000)(Math.pow(2, currentRetry) * 1000)
        console.log(`Couldn't establish connection with the GSR50, retrying in ${nextAttemptTime / 1000} seconds...`)
        return pDelay(nextAttemptTime).then(() => this.connect(currentRetry + 1))
      }

      throw e
    })
}

Gsr50.prototype.getDeviceState = function getDeviceState () {
  return got.get('http://localhost:9000/getStatus')
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
  return got.get('http://localhost:9000/getCashUnits')
    .then(r => resolveOrThrow(r, '/getCashUnits'))
}

Gsr50.prototype.setDeviceCashUnits = function setDeviceCashUnits (cassettes, stackers) {
  return this.getDeviceCashUnits()
    .then(res => {
      let units = {
        cashbox: {
          Number: 8,
          Mode: CASH_UNIT_MODES.CashIn,
          Position: CASH_UNIT_POSITIONS.CashBox1,
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
                Position: CASH_UNIT_POSITIONS.Cassette1 + value,
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
              [`stacker${value + 1}f`]: {
                Number: 1 + value * 2,
                Mode: CASH_UNIT_MODES.Recycle,
                Position: CASH_UNIT_POSITIONS.Stacker1F + value * 2,
                Count: stackers[value * 2].count,
                Currency: {
                  CurrencyCode: this.fiatCode,
                  Denomination: stackers[value * 2].denomination.toNumber()
                }
              },
              [`stacker${value + 1}r`]: {
                Number: 1 + value * 2 + 1,
                Mode: CASH_UNIT_MODES.Recycle,
                Position: CASH_UNIT_POSITIONS.Stacker1F + value * 2 + 1,
                Count: stackers[value * 2 + 1].count,
                Currency: {
                  CurrencyCode: this.fiatCode,
                  Denomination: stackers[value * 2 + 1].denomination.toNumber()
                }
              }
            })
          },
          units,
          _.range(0, _.size(stackers) / 2)
        )
      }

      return units
    })
    .then(cashUnits => got.post('http://localhost:9000/setCashUnits', { body: JSON.stringify(cashUnits) }))
    .then(r => resolveOrThrow(r, '/setCashUnits'))
}

Gsr50.prototype.reset = function reset (mode) {
  return got.post('http://localhost:9000/reset', {
    body: JSON.stringify({
      Type: RESET_MODES[mode]
    })
  })
    .then(r => resolveOrThrow(r, '/reset'))
}

Gsr50.prototype.cashRollback = function cashRollback () {
  return got.post('http://localhost:9000/rollback')
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
  console.log('GSR50: enabling')
}

Gsr50.prototype.disable = function disable () {
  console.log('GSR50: disabling')
  return got.post('http://localhost:9000/acceptCashEnd')
    .then(r => resolveOrThrow(r, '/acceptCashEnd'))
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
  this.emit('billsAccepted')
  var list = []
  return got.post('http://localhost:9000/acceptCashStart')
    .then(r => resolveOrThrow(r, '/acceptCashStart'))
    .then(res => {
      const [RefusedNotes, AcceptedBills] = res
      if (!_.isNil(AcceptedBills)) {
        const _stackers = _.cloneDeep(this.stackers)
        AcceptedBills.forEach(ab => {
          const destinationUnit = _.find(it => it.denomination.toNumber() === ab.Denomination && it.count < 60)(_stackers)
          list.push({
            denomination: ab.Denomination,
            destinationUnit: !_.isNil(destinationUnit) ? destinationUnit.name : 'cashbox'
          })

          if (!_.isNil(destinationUnit)) destinationUnit.count++
        })
      }
      return list
    })
    .then(() => this.emit('billsRead', list))
    .then(() => list)
}

Gsr50.prototype._setup = function _setup (data) {
  this.fiatCode = data.fiatCode
  this.cassettes = data.cassettes
  this.stackers = data.stackers
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
  const billsToDispense = _.map.convert({cap: false})((it, idx) => ({ Denomination: it.denomination.toNumber(), Amount: notes[idx], FiatCode: this.fiatCode }), _.concat(this.cassettes, this.stackers))
  const filteredBills = _.filter(it => it.Amount > 0)(billsToDispense)
  return got.post('http://localhost:9000/dispense', {
    body: JSON.stringify({
      BillsToDispense: filteredBills
    })
  })
    .then(r => resolveOrThrow(r, '/dispense'))
    .then(([CashUnits]) => {
      const units = _.map(it => ({ name: it.name, dispensed: 0, rejected: 0 }))(_.concat(this.cassettes, this.stackers))

      _.forEach(it => {
        const unit = _.find(ite => ite.name === _.toLower(_.invert(CASH_UNIT_POSITIONS)[it.Position]))(units)
        unit.dispensed += it.DispensedCount
        unit.rejected += it.RejectCount
      })(CashUnits)

      return pDelay(2000).then(() => ({ value: _.map(_.pick(['dispensed', 'rejected']))(units) }))
    })
}

Gsr50.prototype.deposit = function deposit () {
  this.emit('billsValid')
  return got.post('http://localhost:9000/acceptCashEnd')
    .then(r => resolveOrThrow(r, '/acceptCashEnd'))
}

Gsr50.prototype.stack = function stack () {
  return this.deposit()
}

Gsr50.prototype.emptyUnit = function emptyUnit () {
  return got.post('http://localhost:9000/emptyUnit')
    .then(r => resolveOrThrow(r, '/emptyUnit'))
    .then(() => this.getDeviceCashUnits())
    .then((_units = []) => {
      const units = _.reduce(
        (acc, value) => Object.assign(acc, { [_.includes('Cashbox', value.Position) ? 'cashbox' : _.toLower(_.invert(CASH_UNIT_POSITIONS)[value.Position])]: value.Count }),
        {},
        _units
      )

      return { units, fiatCode: this.fiatCode }
    })
}

Gsr50.prototype.refillUnit = function refillUnit () {
  return got.post('http://localhost:9000/refillUnit')
    .then(r => resolveOrThrow(r, '/refillUnit'))
    .then(() => this.getDeviceCashUnits())
    .then((units = []) => ({
      units: _.reduce(
        (acc, value) => Object.assign(acc, { [_.includes('Cashbox', value.Position) ? 'cashbox' : _.toLower(_.invert(CASH_UNIT_POSITIONS)[value.Position])]: value.Count }),
        {},
        units
      )
    }))
}

Gsr50.prototype.updateCounts = function updateCounts (newCounts) {
  _.forEach(it => it.count = _.defaultTo(it.count, newCounts[it.name]))(this.cassettes)
  _.forEach(it => it.count = _.defaultTo(it.count, newCounts[it.name]))(this.stackers)

  return this.setDeviceCashUnits(this.cassettes, this.stackers)
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
