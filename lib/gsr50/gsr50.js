const uuid = require('uuid')
const got = require('got')
const _ = require('lodash/fp')
const pDelay = require('delay')

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

Gsr50.factory = function factory (config) {
  return new Gsr50(config)
}

Gsr50.prototype.setFiatCode = function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
}

Gsr50.prototype.run = function run (cb, cassettes) {
  return this.connect()
    .then(() => this.getDeviceState())
    .then(() => this.getDeviceCashUnits())
    .then(() => this.setDeviceCashUnits(cassettes))
    .then(() => cb())
    .catch(() => cb())
}

Gsr50.prototype.connect = function connect () {
  return got.post('http://localhost:9000/connect')
    .then(r => resolveOrThrow(r, '/connect'))
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
        res.Value.SupportedCurrencies || []
      )
    })
}

Gsr50.prototype.getDeviceCashUnits = function getDeviceCashUnits () {
  return got.get('http://localhost:9000/getCashUnits')
    .then(r => resolveOrThrow(r, '/getCashUnits'))
}

Gsr50.prototype.setDeviceCashUnits = function setDeviceCashUnits (cassettes) {
  return this.getDeviceCashUnits()
    .then(res => ({
      cashbox: {
        Number: 8,
        Mode: CASH_UNIT_MODES.CashIn,
        Position: CASH_UNIT_POSITIONS.CashBox1,
        Count: _.find(it => it.Number === 8 && it.Position === CASH_UNIT_POSITIONS.CashBox1, res.Value.Units).Count,
        Currency: {
          CurrencyCode: this.fiatCode
        }
      },
      cassette1: {
        Number: 2,
        Mode: CASH_UNIT_MODES.Recycle,
        Position: CASH_UNIT_POSITIONS.Stacker1R,
        Count: cassettes[0].count,
        // Count: _.find(it => it.Number === 2 && it.Position === CASH_UNIT_POSITIONS.Stacker1R, res.Value.Units).Count,
        Currency: {
          CurrencyCode: this.fiatCode,
          Denomination: cassettes[0].denomination.toNumber()
        }
      },
      cassette2: {
        Number: 4,
        Mode: CASH_UNIT_MODES.Recycle,
        Position: CASH_UNIT_POSITIONS.Stacker2F,
        Count: cassettes[1].count,
        // Count: _.find(it => it.Number === 4 && it.Position === CASH_UNIT_POSITIONS.Stacker2F, res.Value.Units).Count,
        Currency: {
          CurrencyCode: this.fiatCode,
          Denomination: cassettes[1].denomination.toNumber()
        }
      },
      cassette3: {
        Number: 6,
        Mode: CASH_UNIT_MODES.Recycle,
        Position: CASH_UNIT_POSITIONS.Stacker2R,
        Count: cassettes[2].count,
        // Count: _.find(it => it.Number === 6 && it.Position === CASH_UNIT_POSITIONS.Stacker2R, res.Value.Units).Count,
        Currency: {
          CurrencyCode: this.fiatCode,
          Denomination: cassettes[2].denomination.toNumber()
        }
      },
      cassette4: {
        Number: 7,
        Mode: CASH_UNIT_MODES.Recycle,
        Position: CASH_UNIT_POSITIONS.Stacker3F,
        Count: cassettes[3].count,
        // Count: _.find(it => it.Number === 7 && it.Position === CASH_UNIT_POSITIONS.Stacker3F, res.Value.Units).Count,
        Currency: {
          CurrencyCode: this.fiatCode,
          Denomination: cassettes[3].denomination.toNumber()
        }
      },
      escrow: {
        Number: 1,
        Mode: CASH_UNIT_MODES.CashIn,
        Position: CASH_UNIT_POSITIONS.Stacker1F,
        Count: _.find(it => it.Number === 1 && it.Position === CASH_UNIT_POSITIONS.Stacker1F, res.Value.Units).Count,
      }
    })
  )
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
}

Gsr50.prototype.highestBill = function highestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.gte(bill))
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
}

Gsr50.prototype.lowestBill = function lowestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.lte(bill))
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
  var list = []
  return got.post('http://localhost:9000/acceptCashStart')
    .then(r => resolveOrThrow(r, '/acceptCashStart'))
    .then(res => {
      const [RefusedNotes, AcceptedBills] = res.Value
      return _.isNil(AcceptedBills) ? [] : AcceptedBills.forEach(ab => _.range(0, ab.Amount).forEach(() => list.push({ denomination: ab.Denomination })))
    })
    .then(() => got.post('http://localhost:9000/acceptCashEnd'))
    .then(r => resolveOrThrow(r, '/acceptCashEnd'))
    .then(() => list)
}

Gsr50.prototype._setup = function _setup (data) {
  this.fiatCode = data.fiatCode
  this.cassettes = data.cassettes
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
  const billsToDispense = _.map.convert({cap: false})((it, idx) => ({ Denomination: it.denomination.toNumber(), Amount: notes[idx], FiatCode: this.fiatCode }), this.cassettes)
  return got.post('http://localhost:9000/dispense', {
    body: JSON.stringify({
      BillsToDispense: billsToDispense
    })
  })
    .then(r => resolveOrThrow(r, '/dispense'))
    .then(res => {
      const cassettesPositions = [
        CASH_UNIT_POSITIONS.Stacker1R,
        CASH_UNIT_POSITIONS.Stacker2F,
        CASH_UNIT_POSITIONS.Stacker2R,
        CASH_UNIT_POSITIONS.Stacker3F
      ]

      const cassetteUnits = _.flow([
        _.filter(it => cassettesPositions.includes(it.Position)),
        _.sortBy(it => it.Position),
        _.map(it => ({ dispensed: it.DispensedCount, rejected: it.RejectCount }))
      ])(res.Value)

      const response = {}

      response.error = !res.Success && res.Error
      response.value = cassetteUnits

      return pDelay(2000).then(() => response)
    })
}

Gsr50.prototype.deposit = function deposit () {
  return Promise.resolve()
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
    return res
  }
}

module.exports = Gsr50
