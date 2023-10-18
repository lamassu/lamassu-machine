const { EventEmitter } = require('events')
const util = require('util')
const got = require('got')
const _ = require('lodash/fp')
const pDelay = require('delay')
const net = require('net')

const BN = require('../../bn')

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
  this.recyclers = null
  this.dispenseLimit = 20
}

util.inherits(Gsr50, EventEmitter)
Gsr50.factory = function factory (config) {
  if (!instance) {
    instance = new Gsr50(config)
  }
  return instance
}

Gsr50.prototype.getDeviceState = function getDeviceState () {
  this.denominations = _.reduce(
    (acc, value) => Object.assign(acc, {
      [value]: {
        denomination: value,
        fiatCode: this.fiatCode
      }
    }),
    {},
    [1, 5, 10, 20, 50]
  )
}

Gsr50.prototype.isCashRecycler = true

Gsr50.prototype.setFiatCode = function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
}

function handleCommand (msg) {
  const denomination = msg.denomination && BN(msg.denomination)
  switch (msg.command) {
    case 'insertBill':
      this.emitEvent(denomination)
      break
    case 'stackerOpen':
      this.emit('stackerOpen')
      break
    default:
      throw new Error(`No such command: ${msg.command}`)
  }
}

Gsr50.prototype.run = function run (cb, { cassettes, recyclers }) {
  this.getDeviceState()
  const handler = handleCommand.bind(this)
  process.on('message', handler)

  const server = net.createServer(socket => {
    socket.on('data', (data) => handler(JSON.parse(data)))
  })
    .on('error', err => {
      console.log(err)
    })

  server.listen({port: 3077}, (err, res) => {
    if (err) throw err
    console.log('Bills server listening on port 3077')
  })
  return Promise.resolve(() => cb())
}

Gsr50.prototype.lightOn = function lightOn () {
  console.log('GSR50: lightOn')
}

Gsr50.prototype.lightOff = function lightOff () {
  console.log('GSR50: lightOff')
}

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
}

Gsr50.prototype.reenable = function reenable () {
  console.log('GSR50: enabling')
  return this.cashCount()
}

Gsr50.prototype.cashCount = function cashCount () {
}

Gsr50.prototype.emitEvent = function emitEvent(bill) {
  var list = []

  const destinationUnit = _.find(it => it.denomination.toNumber() === bill.toNumber() && it.count < 60)(this.recyclersCounts)

  if (destinationUnit) {
    this.recyclersCounts[destinationUnit.number].count++
  }

  list.push({
    denomination: bill,
    destinationUnit: !_.isNil(destinationUnit) ? destinationUnit.name : 'cashbox'
  })

  this.emit('billsRead', list)
}

Gsr50.prototype._setup = function _setup (data) {
  this.fiatCode = data.fiatCode
  this.cassettes = data.cassettes
  this.cassettesCounts = _.keyBy(it => it.number, data.cassettes)
  this.recyclers = data.recyclers
  this.recyclersCounts = _.keyBy(it => it.number, data.recyclers)
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
  const response = {}
  response.value = _.map(it => ({ dispensed: it, rejected: 0 }), notes)

  return pDelay(2000).then(() => response)
}

Gsr50.prototype.deposit = function deposit () {
  this.emit('billsValid')
}

Gsr50.prototype.stack = function stack () {
  return this.deposit()
}

Gsr50.prototype.emptyUnit = function emptyUnit () {
  let count = 0
  const units = _.reduce(
    (acc, value) => {
      count += _.defaultTo(0, value.count)
      return Object.assign(acc, {
        [value.name]: 0
      })
    },
    {},
    _.concat(this.cassettes, this.recyclers)
  )

  // TODO: check if this can give erroneous amounts in the real hardware. In the mock it should give false amounts when the cashbox is not emptied via admin, since the machine doesn't keep track of the bills inside the cashbox. But the real hardware does
  units.cashbox = count

  return Promise.resolve({ units, fiatCode: this.fiatCode })
}

Gsr50.prototype.refillUnit = function refillUnit () {
  const units = {}
  _.forEach(cassette => {
    _.forEach(recycler => {
      if (cassette.denomination.eq(recycler.denomination)) {
        const newCount = _.clamp(recycler.count, recycler.name === 'recycler1' ? 40 : 60)(recycler.count + cassette.count)
        const movedBills = newCount - recycler.count

        recycler.count += movedBills
        cassette.count -= movedBills

        units[recycler.name] = recycler.count
      }
    })(_.clone(this.recyclers))
    units[cassette.name] = cassette.count
  })(_.clone(this.cassettes))

  return Promise.resolve({ units })
}

Gsr50.prototype.updateCounts = function updateCounts (newCounts) {
}

module.exports = Gsr50
