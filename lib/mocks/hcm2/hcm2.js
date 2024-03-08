'use strict'
const { EventEmitter } = require('events')
const util = require('util')
const net = require('net')
const _ = require('lodash/fp')
const pDelay = require('delay')

const BN = require('../../bn')

const responses = require('./mock-responses')

const recyclerNameByIndex = i => (['2A', '3A', '4A', '5A'][i])

const Hcm2 = function (config) {
  this.name = 'HCM2'
  EventEmitter.call(this)
  this.config = config

  // Bill validator variables
  this.fiatCode = null
  this.denominations = null
  this.denomCodeSettings = null

  // Bill dispenser variables
  this.initializing = null
  this.initialized = null
  this.recyclers = null

  this.insertedBills = []
  this.shutterOpened = false
}

util.inherits(Hcm2, EventEmitter)
Hcm2.factory = function factory (config) {
  return new Hcm2(config)
}

Hcm2.prototype.isCashRecycler = true
Hcm2.prototype.hasShutter = true

Hcm2.prototype.setFiatCode = function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
}

Hcm2.prototype.hasDenominations = function hasDenominations () {
  return this.denominations !== null
}

Hcm2.prototype.getFirmwareVersion = function getFirmwareVersion () {
  return responses.getFirmwareVersion().then(({ result }) => result)
}

Hcm2.prototype.getInfo = function getInfo () {
  return responses.getInfo().then(({ result }) => result)
  .then(body => {
    const denomCodeSettingsPairs = body['DenomCodeSettings'].split(',')
    this.denomCodeSettings = _.fromPairs(_.map(_.flow([_.replace(new RegExp('NoteId', 'g'), ''), _.split(':')]), denomCodeSettingsPairs))
  })
}

Hcm2.prototype.getBanknoteInfo = function getBanknoteInfo (recyclers) {
  if (recyclers.length !== 4)
    return Promise.reject(new Error(`Expected 4 recyclers, got ${recyclers.length}`))

  return responses.getBanknoteInfo().then(({ result }) => result)
  .then(body => {
    const validNoteIds = _.flow([
      _.replace(new RegExp('NoteId', 'g'), 'Id:'),
      _.split(','),
      _.map(_.split(':')),
      _.chunk(7),
      _.map(_.fromPairs)
    ])(body.allNoteID)
    this.denominations = _.reduce((acc, it) => Object.assign(acc, { [it.Id]: it.Val }), {}, validNoteIds)
    this.recyclers = recyclers.map(
      recycler => {
        const noteId = _.findKey(denom => recycler.denomination.eq(denom), this.denominations)
        if (_.isNil(noteId)) throw new Error(`${recycler.name} has no configured denomination`)
        return _.set('noteId', noteId, recycler)
      }
    )
  })
}

Hcm2.prototype.setDenomination = function setDenomination () {
  return responses.setDenomination().then(({ result }) => result)
}

Hcm2.prototype.setInfo = function setInfo () {
  return responses.setInfo({
    DenomCassette1A: 'Unknown',
    DenomCassette2A: _.get([0, 'noteId'], this.recyclers),
    DenomCassette3A: _.get([1, 'noteId'], this.recyclers),
    DenomCassette4A: _.get([2, 'noteId'], this.recyclers),
    DenomCassette5A: _.get([3, 'noteId'], this.recyclers),
    DenomCassette1B: 'Unknown',
    DenomCassette1C: 'Unknown',
    HardwareType1A: 'AB',
    HardwareType2A: 'RB',
    HardwareType3A: 'RB',
    HardwareType4A: 'RB',
    HardwareType5A: 'RB',
    RoomOperation1A: 'Deposit',
    RoomOperation1B: 'Unloaded',
    RoomOperation1C: 'Unloaded',
    RoomOperation2A: 'Recycle',
    RoomOperation3A: 'Recycle',
    RoomOperation4A: 'Recycle',
    RoomOperation5A: 'Recycle',
    RepudiatedDenoms: '0',
    CashCountMissingCornerUnfitLevel: 'Default',
    CashCountSoiledUnfitLevel: 'Default',
    CashCountMisshapenUnfitLevel: 'Default',
    CashCountTapedUnfitLevel: 'Default',
    CashCountVerificationLevel: 'Default',
    DepositVerificationLevel: 'Default',
    DispenseMissingCornerUnfitLevel: 'Default',
    DispenseSoiledUnfitLevel: 'Default',
    DispenseMisshapenUnfitLevel: 'Default',
    DispenseTapedUnfitLevel: 'Default',
    DispenseVerificationLevel: 'Default',
  })
  .then(({ result }) => result)
}

Hcm2.prototype.reset = function reset (mode) {
  return responses.reset().then(({ result }) => result)
}

Hcm2.prototype.openCloseShutter = function openCloseShutter (open) {
  this.shutterOpened = open
  return responses.openCloseShutter().then(({ result }) => result)
}

Hcm2.prototype.openShutter = function () {
  return this.openCloseShutter(true)
}

Hcm2.prototype.closeShutter = function () {
  return this.openCloseShutter(false)
}

Hcm2.prototype.cashCount = function cashCount () {
  this.emit('billsAccepted')
  this.emit('billsRead', this.insertedBills)
}

Hcm2.prototype.stack = function () {
  this.insertedBills = []
  this.emit('billsValid')
}

Hcm2.prototype.cashRollback = function cashRollback () {
  return responses.cashRollback().then(({ result }) => result)
}

const findCassetteByDenom = recyclers => denom =>
  _.find(({ denomination }) => denomination.eq(denom), recyclers)

function handleCommand (msg) {
  const denomination = msg.denomination && BN(msg.denomination)
  switch (msg.command) {
    case 'insertBill':
      if (this.shutterOpened) {
        console.log("hcm2:recyclers:", this.recyclers)
        const destinationUnit = _.flow(
          findCassetteByDenom(this.recyclers),
          _.defaultTo({ name: 'cashbox' }),
          _.get(['name']),
        )(denomination)
        this.insertedBills.push({ denomination, destinationUnit })
      }
      break
    case 'stackerOpen':
      this.emit('stackerOpen')
      break
    default:
      throw new Error(`No such command: ${msg.command}`)
  }
}

Hcm2.prototype.run = function run (cb, { recyclers }) {
  return this.getFirmwareVersion()
    .then(() => this.getInfo())
    .then(() => this.getBanknoteInfo(recyclers))
    .then(() => this.setDenomination())
    .then(() => this.setInfo())
    .then(() => this.getInfo())
    .then(() => this.reset('full'))
    .then(() => {
      const handler = handleCommand.bind(this)
      process.on('message', handler)
      const server = net.createServer(socket => {
        socket.on('data', data => handler(JSON.parse(data)))
      })
        .on('error', err => {
          console.log(err)
        })

      server.listen({ port: 3077 }, (err, res) => {
        if (err) throw err
        console.log('Bills server listening on port 3077')
      })

      cb()
    })
}

Hcm2.prototype.enable = function enable () {
  console.log('Shutter opened')
  this.openCloseShutter(true)
}

Hcm2.prototype.disable = function disable () {
  console.log('Shutter closed')
  this.openCloseShutter(false)
}

Hcm2.prototype.reject = function reject () {
  console.log('mock HCM2: rolling back bills')
  this.insertedBills = []
  return this.cashRollback()
}

Hcm2.prototype.lightOn = function lightOn () {
  console.log('mock HCM2: lightOn')
}

Hcm2.prototype.lightOff = function lightOff () {
  console.log('mock HCM2: lightOff')
}

Hcm2.prototype.lowestBill = function lowestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.lte(bill))
  if (_.isEmpty(filtered)) return BN(_.min(bills))
  return BN(_.min(filtered))
}

Hcm2.prototype.highestBill = function highestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.gte(bill))
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
}

Hcm2.prototype._setup = function _setup (data) {
  this.fiatCode = data.fiatCode
  this.recyclers = this.config.mockedBalance
    ? this.config.mockedBalance.recyclers
    : data.recyclers
}

Hcm2.prototype.init = function init (data) {
  return new Promise(resolve => {
    if (this.initializing || this.initialized) return resolve()
    this.initializing = true
    this._setup(data)
    this.initialized = true
    this.initializing = false
    resolve()
  })
}

Hcm2.prototype.dispense = function dispense (bills) {
  const error = null //new Error('out of cash')
  const getDispensed = (res, f) => {
    const dispensed = _.toNumber(_.get([`DispenseCountRoom${f}`], res))
    /* pretend out of cash scenario */
    return error ? _.max([0, dispensed - 1]) : dispensed
  }

  const getValue = res => _.map(
      f => {
        const dispensed = getDispensed(res, f)
        const fed = _.toNumber(_.get([`FedNotes${f}`], res))
        const rejected = fed - dispensed
        return { dispensed, rejected }
      },
      ['2A', '3A', '4A', '5A']
    )

  const params = _.flow(
    _.range(0),
    _.map(i => [`NotesRoom${recyclerNameByIndex(i)}`, bills[i]]),
    _.fromPairs,
  )(bills.length)
  return responses.dispenseByRoom(params).then(({ result }) => result)
    .then(res => ({
      error,
      value: getValue(res),
    }))
}

Hcm2.prototype.waitForBillsRemoved = function waitForBillsRemoved () {
  return pDelay(2000).then(_.stubTrue)
}

Hcm2.prototype.canSendCoins = function () {
  return Promise.resolve(this.insertedBills.length === 0)
}

module.exports = Hcm2
