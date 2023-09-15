'use strict'
const { EventEmitter } = require('events')
const util = require('util')
const _ = require('lodash/fp')
const pDelay = require('delay')

const BN = require('../../bn')

const responses = require('./mock-responses')

const HOST = 'localhost'
const PORT = 8081

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
  this.cassettes = null

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

Hcm2.prototype.getBanknoteInfo = function getBanknoteInfo (cassettes = []) {
  return responses.getBanknoteInfo().then(({ result }) => result)
  .then(body => {
    const validNoteIds = _.flow([
      _.replace(new RegExp('NoteId', 'g'), 'Id:'),
      _.split(','),
      _.map(_.split(':')),
      _.chunk(7),
      _.map(_.fromPairs)
    ])(body['allNoteID'])
    this.denominations = _.reduce((acc, it) => Object.assign(acc, { [it.Id]: it.Val }), {}, validNoteIds)
    this.cassettes = cassettes.map(
      (it, idx) => Object.assign(it, {
        cassetteName: ['2A', '3A', '4A', '5A'][idx],
        noteId: _.find(ite => this.denominations[ite] === it.denomination.toString(), _.keys(this.denominations))
      })
    )
  })
}

Hcm2.prototype.setDenomination = function setDenomination () {
  return responses.setDenomination().then(({ result }) => result)
}

Hcm2.prototype.setInfo = function setInfo () {
  const getNoteIDByCassetteName = (cn, def) => _.flow(
    _.find(it => it.cassetteName === cn),
    _.defaultTo({}),
    _.get(['noteId']),
    _.defaultTo(_.defaultTo('0', def))
  )(this.cassettes)
  const params = {
    DenomCassette1A: 'Unknown',
    DenomCassette2A: getNoteIDByCassetteName('2A', '1'),
    DenomCassette3A: getNoteIDByCassetteName('3A', '5'),
    DenomCassette4A: getNoteIDByCassetteName('4A', '6'),
    DenomCassette5A: getNoteIDByCassetteName('5A', '7'),
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
  }
  return responses.setInfo(params).then(({ result }) => result)
}

Hcm2.prototype.reset = function reset (mode) {
  return responses.reset().then(({ result }) => result)
}

Hcm2.prototype.openCloseShutter = function openCloseShutter (open) {
  this.shutterOpened = open
  return responses.openCloseShutter().then(({ result }) => result)
}

Hcm2.prototype.cashCount = function cashCount () {
  // TODO
  const insertedBills = this.insertedBills
  return responses.cashCount(insertedBills).then(res => insertedBills)
}

Hcm2.prototype.deposit = function deposit (bills) {
  const params = null // TODO
  return responses.deposit(params).then(({ result }) => result)
}

Hcm2.prototype.cashRollback = function cashRollback () {
  return responses.cashRollback().then(({ result }) => result)
}

Hcm2.prototype.dispenseByRoom = function dispenseByRoom (bills) {
  const params = null // TODO
  return responses.dispenseByRoom(params).then(({ result }) => result)
}

Hcm2.prototype.run = function run (cb, cassettes) {
  return this.getFirmwareVersion()
    .then(() => this.getInfo())
    .then(() => this.getBanknoteInfo(cassettes))
    .then(() => this.setDenomination())
    .then(() => this.setInfo())
    .then(() => this.getInfo())
    .then(() => this.reset('full'))
    .then(() => cb())
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
}

Hcm2.prototype.init = function init (data) {
  return new Promise(resolve => {
    if (this.initializing || this.initialized) return resolve()

    this.initializing = true
    this._setup(data)

    setTimeout(() => {
      this.initialized = true
      this.initializing = false
      resolve()
    }, 1000)
  })
}

Hcm2.prototype.dispense = function dispense (notes) {
  return this.dispenseByRoom(notes)
    .then(res => _.pick([
        'DispenseCountRoom2A',
        'DispenseCountRoom3A',
        'DispenseCountRoom4A',
        'DispenseCountRoom5A',
      ], res))
    .then(billInfo =>
      pDelay(2000)
        .then(() => ({
          value: _.map(it => ({ dispensed: _.toNumber(billInfo[it]), rejected: 0 }), _.keys(billInfo))
        }))
    )
}

Hcm2.prototype.waitForBillsRemoved = function waitForBillsRemoved () {
  return pDelay(2000).then(_.stubTrue)
}

Hcm2.prototype.billsPresent = function billsPresent () {
  return pDelay(2000).then(_.stubFalse)
}

Hcm2.prototype.stack = function stack () {
  return this.deposit()
}

module.exports = Hcm2
