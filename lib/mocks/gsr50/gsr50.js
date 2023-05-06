const uuid = require('uuid')
const { EventEmitter } = require('events')
const util = require('util')
const got = require('got')
const _ = require('lodash/fp')
const pDelay = require('delay')

const BN = require('../../bn')

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
  this.stackers = null
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

Gsr50.prototype.run = function run (cb, cassettes, stackers) {
  return this.connect()
    .then(() => this.getDeviceState())
    .then(() => this.getDeviceCashUnits())
    .then(() => this.setDeviceCashUnits(cassettes, stackers))
    .then(() => cb())
    .catch(err => cb(err))
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
            fiatCode: this.fiatCode
          }
        }),
        {},
        res.SupportedCurrencies || [{ Denomination: 1 }, { Denomination: 5 }, { Denomination: 10 }, { Denomination: 20 }, { Denomination: 50 }]
      )
    })
}

Gsr50.prototype.getDeviceCashUnits = function getDeviceCashUnits () {
  return got.get('http://localhost:9000/getCashUnits')
    .then(r => resolveOrThrow(r, '/getCashUnits'))
}

Gsr50.prototype.setDeviceCashUnits = function setDeviceCashUnits (cassettes, stackers) {
  this.cassettes = cassettes
  this.stackers = stackers

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

  return got.post('http://localhost:9000/setCashUnits', {
    body: JSON.stringify(units)
  }).then(r => resolveOrThrow(r, '/setCashUnits'))
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
  // return got.post('http://localhost:9000/acceptCashStart')
}

Gsr50.prototype.disable = function disable () {
  console.log('GSR50: disabling')
  // return got.post('http://localhost:9000/acceptCashEnd')
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
  return got.get('http://localhost:8082/bills') // This is mock-only, to retrieve a list of bills from the fake-recycler script
    .then(res => {
      const body = JSON.parse(res.body)
      return body.bills
    })
    .then(bills => got.post('http://localhost:9000/acceptCashStartMock', { body: JSON.stringify({ FiatCode: this.fiatCode, Bills: bills.map(it => ({ Denomination: it.denomination })) }) }))
    .then(r => resolveOrThrow(r, '/acceptCashStartMock'))
    .then(res => {
      const [RefusedNotes, AcceptedBills] = res
      if (!_.isNil(AcceptedBills)) {
        const _stackers = _.cloneDeep(this.stackers)
        AcceptedBills.forEach(
          ab => _.range(0, ab.Amount).forEach(
            () => {
              const destinationUnit = _.find(it => it.denomination.toNumber() === ab.Denomination && it.count < 60)(_stackers)
              list.push({
                denomination: ab.Denomination,
                destinationUnit: !_.isNil(destinationUnit) ? destinationUnit.name : 'cashbox'
              })

              if (!_.isNil(destinationUnit)) destinationUnit.count++
            }
          )
        )
        this.stackers = _stackers
      }
      return list
    })
    .then(() => got.post('http://localhost:9000/acceptCashEndMock', { body: JSON.stringify({ FiatCode: this.fiatCode, Bills: [] }) }))
    .then(r => resolveOrThrow(r, '/acceptCashEndMock'))
    .then(() => this.emit('billsRead', list))
    .then(() => list)
}

Gsr50.prototype._setup = function _setup (data) {
  console.log(data)
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
  const billsToDispense = _.concat(
    _.map.convert({cap: false})((it, idx) => ({ Denomination: it.denomination.toNumber(), Amount: notes[idx], FiatCode: this.fiatCode }), this.cassettes),
    _.map.convert({cap: false})((it, idx) => ({ Denomination: it.denomination.toNumber(), Amount: notes[idx + this.cassettes.length], FiatCode: this.fiatCode }), this.stackers)
  )
  return got.post('http://localhost:9000/dispense', {
    body: JSON.stringify({
      BillsToDispense: billsToDispense
    })
  })
    .then(r => resolveOrThrow(r, '/dispense'))
    .then(() => {
      // This is a mock-only shortcut. The real GSR50 should use the response from the webserver
      const response = {}

      response.error = null
      response.value = _.map(it => ({ dispensed: it, rejected: 0 }), notes)

      return pDelay(2000).then(() => response)
    })
}

Gsr50.prototype.deposit = function deposit () {
  this.emit('billsValid')
  return Promise.resolve()
}

Gsr50.prototype.stack = function stack () {
  return this.deposit()
}

Gsr50.prototype.emptyUnit = function emptyUnit () {
  return got.post('http://localhost:9000/emptyUnit')
    .then(r => pDelay(5000).then(() => resolveOrThrow(r, '/emptyUnit')))
    .then(() => {
      let count = 0
      const units = _.reduce(
        (acc, value) => {
          count += _.defaultTo(0, value.count)
          return Object.assign(acc, {
            [value.name]: 0
          })
        },
        {},
        _.concat(this.cassettes, this.stackers)
      )

      // TODO: check if this can give erroneous amounts in the real hardware. In the mock it should give false amounts when the cashbox is not emptied via admin, since the machine doesn't keep track of the bills inside the cashbox. But the real hardware does
      units.cashbox = count

      return { units, fiatCode: this.fiatCode }
    })
}

Gsr50.prototype.refillUnit = function refillUnit () {
  return got.post('http://localhost:9000/refillUnit')
    .then(r => pDelay(5000).then(() => resolveOrThrow(r, '/refillUnit')))
    .then(() => {
      const units = {}
      _.forEach(cassette => {
        _.forEach(stacker => {
          if (cassette.denomination.eq(stacker.denomination)) {
            const newCount = _.clamp(stacker.count, stacker.name === 'stacker1f' ? 40 : 60)(stacker.count + cassette.count)
            const movedBills = newCount - stacker.count

            stacker.count += movedBills
            cassette.count -= movedBills

            units[stacker.name] = stacker.count
          }
        })(_.clone(this.stackers))
        units[cassette.name] = cassette.count
      })(_.clone(this.cassettes))

      return { units }
    })
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
      console.log(`An error occurred in GSR50's ${route} route (error code ${res.ErrorCode}). More information about the error: ${JSON.stringify(res.ErrorInfo)}`)
    }
  } catch (e) {
    console.error(e)
  } finally {
    return res.Value
  }
}

module.exports = Gsr50
