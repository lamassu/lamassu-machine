'use strict'
const uuid = require('uuid')
const { EventEmitter } = require('events')
const util = require('util')
const got = require('got')
const _ = require('lodash/fp')
const pDelay = require('delay')

const BN = require('../bn')

const testNotes = 'true'
let ID = 0
const getID = () => {
  const id = ID++
  return id.toString()
}

const repeat = (c, x) => _.map(_.constant(x), _.range(0, c))
const leftpad = (s, w, c) => c.repeat(Math.max(w-s.length, 0)) + s

const formatYear = datetime => datetime.getFullYear().toString()
const formatMonth = datetime => leftpad(datetime.getMonth().toString(), 2, '0')
const formatDay = datetime => leftpad(datetime.getDay().toString(), 2, '0')
const formatDate = datetime =>
  formatYear(datetime) + '-' + formatMonth(datetime) + '-' + formatDay(datetime)

const formatHours = datetime => leftpad(datetime.getHours().toString(), 2, '0')
const formatMinutes = datetime => leftpad(datetime.getMinutes().toString(), 2, '0')
const formatTime = datetime =>
  formatHours(datetime) + ':' + formatMinutes(datetime)

const formatDateTime = datetime =>
  formatDate(datetime) + ' ' + formatTime(datetime)

const PORT = 8081
const makeURL = endpoint => `http://localhost:${PORT}/api/${endpoint}`
const rpc_call = (path, body) => {
  console.log("calling", path)
  return got.post(makeURL(path), {
    json: true,
    body: _.assign({ jsonrpc: '2.0', id: getID() }, body)
  })
  .then(({ body: { error, result } }) => {
    console.log(path, "error =", error)
    console.log(path, "result =", result)
    return error ? Promise.reject(error) : Promise.resolve(result)
  })
}

const Hcm2 = function (config) {
  this.name = 'HCM2'
  EventEmitter.call(this)
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

  this.acceptedPending = []
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

Hcm2.prototype.registerUSB = function registerUSB () {
  return rpc_call("ac/configure/registerUSB.cgi", {
    method: 'registerUSB',
    //description: 'Scans all USB devices attached to the host and automatically registers the ARCA-supported ones',
  })
  .then(body =>
    body.result === 'Successful usb register.' ?
      body :
      bodyOrThrow('registerUSB', body)
  )
}

Hcm2.prototype.getFirmwareVersion = function getFirmwareVersion (initial) {
  initial = initial === true
    ? 'true'
    : initial === false
      ? 'false'
      : (initial === 'true' || initial === 'false')
        ? initial : 'true'
  return rpc_call("ac/hitachi/getFirmwareVersion.cgi", {
    method: 'getFirmwareVersion',
    //description: 'Returns the names of the loaded firmwares.',
    params: {
      LDN: 'HCM2_01',
      initial
    }
  })
  .then(reply =>
    reply.responseCode === '70' && reply.commonErrorCode === '9F' && reply.commonErrorCodeDetail === '000000' ? /* Command issued but not after power on. */
      reply :
      bodyOrThrow('getFirmwareVersion', reply)
  )
}

Hcm2.prototype.getInfo = function getInfo () {
  return rpc_call("ac/hitachi/getInfo.cgi", {
      method: 'getInfo',
      //description: 'Get the hardware configuration and operational setting of HCM2.',
      params: {
        LDN: 'HCM2_01'
      }
    })
  .then(reply => bodyOrThrow('getInfo', reply))
  .then(reply => {
    this.denomCodeSettings = _.flow(
      _.get(['DenomCodeSettings']),
      _.split(','),
      _.map(_.flow(_.replace(new RegExp('NoteId', 'g'), ''), _.split(':'))),
      _.fromPairs,
    )(reply)
    return reply
  })
}

Hcm2.prototype.getBanknoteInfo = function getBanknoteInfo (cassettes = []) {
  const parseValidNoteIDs = _.flow(
    _.replace(new RegExp('NoteId', 'g'), 'Id:'),
    _.split(','),
    _.map(_.split(':')),
    _.chunk(7),
    _.map(_.fromPairs)
  )

  return rpc_call("ac/hitachi/getBanknoteInfo.cgi", {
    method: 'getBanknoteInfo',
    //description: 'Get the list of all Note IDs supported by the loaded BV firmware.',
    params: {
      LDN: 'HCM2_01'
    }
  })
  .then(body => bodyOrThrow('getBanknoteInfo', body))
  .then(body => {
    const validNoteIds = parseValidNoteIDs(body.result.allNoteID)
    this.allNoteIds = validNoteIds
    this.denominations = _.reduce((acc, it) => Object.assign(acc, { [it.Id]: it.Val }), {}, validNoteIds)
    this.cassettes = cassettes.map(
      (it, idx) => Object.assign(it, {
        cassetteName: ['2A', '3A', '4A', '5A'][idx],
        noteId: _.find(ite => this.denominations[ite] === it.denomination.toString(), _.keys(this.denominations))
      })
    )
    return body
  })
}

Hcm2.prototype.setDenomination = function setDenomination () {
  return rpc_call("ac/hitachi/setDenomination.cgi", {
    method: 'setDenomination',
    //description: 'Assign Denomination code to each of Note IDs.',
    params: {
      LDN: 'HCM2_01',
      noteIDs: [
        { noteId: '1', denomCode: '1' },
        { noteId: '2', denomCode: '2' },
        { noteId: '3', denomCode: '3' },
        { noteId: '4', denomCode: '4' },
        { noteId: '5', denomCode: '5' },
        { noteId: '6', denomCode: '6' },
        { noteId: '7', denomCode: '7' },
        { noteId: '8', denomCode: '3' },
        { noteId: '9', denomCode: '4' },
        { noteId: '10', denomCode: '5' },
        { noteId: '11', denomCode: '6' },
        { noteId: '12', denomCode: '7' },
        { noteId: '13', denomCode: '3' },
        { noteId: '14', denomCode: '4' },
        { noteId: '15', denomCode: '5' },
        { noteId: '16', denomCode: '6' },
        { noteId: '17', denomCode: '7' }
      ]
    }
  })
  .then(body => bodyOrThrow('setDenomination', body))
}

Hcm2.prototype.setInfo = function setInfo () {
  const getNoteIDByCassetteName = (cn, def) => _.flow(
    _.find(it => it.cassetteName === cn),
    _.defaultTo({}),
    _.get(['noteId']),
    _.defaultTo(_.defaultTo('0', def))
  )(this.cassettes)
  return rpc_call("ac/hitachi/setInfo.cgi", {
    method: 'setInfo',
    //description: 'Specify the hardware configuration and operational setting of HCM2.',
    params: {
      LDN: 'HCM2_01',
      IsMAB: 'false', // 'true' or 'false'
      // NOTE: Docs say "YYMMDDhhmmss" but "YY-MM-DD hh:mm" also works?
      DateTime: formatDateTime(new Date()),
      // TODO: retrieve bill count from server
      TotalStackedNotesURJB: '0', // '0' - '2000'
      TotalStackedNotesONE_A: '0', // '0' - '2000'
      TotalStackedNotesONE_B: '0', // '0' - '2000'
      LaneExists1: 'true', // 'true' or 'false'
      LaneExists2: 'true', // 'true' or 'false'
      LaneExists3: 'true', // 'true' or 'false'
      LaneExists4: 'true', // 'true' or 'false'
      LaneExists5: 'true', // 'true' or 'false'
      DenomCassette1A: 'Unknown', // 'Unknown'
      DenomCassette2A: getNoteIDByCassetteName('2A', '1'), // '1', // list of denoms with COMMA separator (max.16 values: 0-128)
      DenomCassette3A: getNoteIDByCassetteName('3A', '5'), // '3', // list of denoms with COMMA separator (max.16 values: 0-128)
      DenomCassette4A: getNoteIDByCassetteName('4A', '6'), // '4', // list of denoms with COMMA separator (max.16 values: 0-128)
      DenomCassette5A: getNoteIDByCassetteName('5A', '7'), // '5', // list of denoms with COMMA separator (max.16 values: 0-128)
      DenomCassette1B: 'Unknown', // 'Unknown'
      DenomCassette1C: 'Unknown', // 'Unknown'
      HardwareType1A: 'AB', // 'RB', 'AB', 'MAB', 'Unloaded'
      HardwareType2A: 'RB', // 'RB', 'AB', 'MAB', 'Unloaded'
      HardwareType3A: 'RB', // 'RB', 'AB', 'MAB', 'Unloaded'
      HardwareType4A: 'RB', // 'RB', 'AB', 'MAB', 'Unloaded'
      HardwareType5A: 'RB', // 'RB', 'AB', 'MAB', 'Unloaded'
      RoomOperation1A: 'Deposit', // 'Recycle', 'Deposit', 'Dispense', 'Unloaded'
      RoomOperation1B: 'Unloaded', // 'Recycle', 'Deposit', 'Dispense', 'Unloaded'
      RoomOperation1C: 'Unloaded', // 'Recycle', 'Deposit', 'Dispense', 'Unloaded'
      RoomOperation2A: 'Recycle', // 'Recycle', 'Deposit', 'Dispense', 'Unloaded'
      RoomOperation3A: 'Recycle', // 'Recycle', 'Deposit', 'Dispense', 'Unloaded'
      RoomOperation4A: 'Recycle', // 'Recycle', 'Deposit', 'Dispense', 'Unloaded'
      RoomOperation5A: 'Recycle', // 'Recycle', 'Deposit', 'Dispense', 'Unloaded'
      RepudiatedDenoms: '0', // list of denoms with COMMA separator (max.16 values: 1-127)
      CashCountMissingCornerUnfitLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      CashCountSoiledUnfitLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      CashCountMisshapenUnfitLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      CashCountTapedUnfitLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      CashCountVerificationLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      DepositVerificationLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      DispenseMissingCornerUnfitLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      DispenseSoiledUnfitLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      DispenseMisshapenUnfitLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      DispenseTapedUnfitLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      DispenseVerificationLevel: 'Default', // 'Default', 'Nominal', 'Strict', 'Soft', 'No Check'
      // The following block might not exist on the actual hardware
      // StackedNotes2A: _.defaultTo('0', _.defaultTo({}, _.find(it => it.cassetteName === '2A', this.cassettes)).count && _.defaultTo({}, _.find(it => it.cassetteName === '2A', this.cassettes)).count.toString()),
      // StackedNotes3A: _.defaultTo('0', _.defaultTo({}, _.find(it => it.cassetteName === '3A', this.cassettes)).count && _.defaultTo({}, _.find(it => it.cassetteName === '3A', this.cassettes)).count.toString()),
      // StackedNotes4A: _.defaultTo('0', _.defaultTo({}, _.find(it => it.cassetteName === '4A', this.cassettes)).count && _.defaultTo({}, _.find(it => it.cassetteName === '4A', this.cassettes)).count.toString()),
      // StackedNotes5A: _.defaultTo('0', _.defaultTo({}, _.find(it => it.cassetteName === '5A', this.cassettes)).count && _.defaultTo({}, _.find(it => it.cassetteName === '5A', this.cassettes)).count.toString())
    }
  })
  .then(body => bodyOrThrow('setInfo', body))
}

Hcm2.prototype.reset = function reset (mode) {
  return rpc_call("ac/hitachi/reset.cgi", {
    method: 'reset',
    //description: 'Issues the mechanical reset.',
    params: {
      LDN: 'HCM2_01',
      mode: mode // 'full', 'saving', 'quick'
    }
  })
  .then(body => bodyOrThrow('reset', body))
}

Hcm2.prototype.openCloseShutter = function openCloseShutter (open) {
  return rpc_call("ac/hitachi/openCloseShutter.cgi", {
    method: 'openCloseShutter',
    //description: 'Open or Close the CS shutter.',
    params: {
      LDN: 'HCM2_01',
      open: open ? 'true' : 'false', // 'true' (Open), 'false' (Close)
      retry: 'false' // 'true' (Force shutter close), 'false'
    }
  })
  .then(body => bodyOrThrow('openCloseShutter', body))
}

Hcm2.prototype.cashCount = function cashCount () {
  this.emit('billsAccepted')
  return rpc_call("ac/hitachi/cashCount.cgi", {
    method: 'cashCount',
    //description: 'Counts and validates the banknotes set in CS.',
    params: {
      LDN: 'HCM2_01',
      testNotes, // 'true' (Test notes), 'false' (Real notes)
    }
  })
  .then(body => {
    const inserted = _.flow(
        _.get(['result', 'StackedNotesByDenomAndDest']),
        _.split(','),
        _.chunk(3),
        _.groupBy(([_noteId, destination, _count]) => destination),
    )(body)

    const rejected = inserted['Cash Slot']

    const result = _.flow(
      _.omit('Cash Slot'),
      _.mapValues(
        _.flatMap(([noteId, destination, count]) => repeat(count, { denomination: this.denominations[noteId], destination })),
      )
    )(inserted)

    return { body, result, rejected }
  })
  .then(({ body, result, rejected }) => {
    const accepted = result.Escrow
    this.acceptedPending = []
    if (_.isEmpty(accepted) && _.isEmpty(rejected)) {
      this.emit('billsRejected')
    } else if (!_.isEmpty(accepted) && _.isEmpty(rejected)) {
      this.emit('billsRead', accepted)
    } else {
      this.acceptedPending = accepted
      this.emit('cashSlotRemoveBills')
    }
    return { body, result, rejected }
  })
  .then(({ body }) => bodyOrThrow('cashCount', body))
  .catch(res => {
    console.log(res)
    return res.body.result.commonErrorCode === '84' && res.body.result.commonErrorCodeDetail === '030000' ?
      Promise.resolve({
        body: res.body,
        result: { Escrow: [] }
      }) :
      Promise.reject(res)
  })
}

Hcm2.prototype.deposit = function deposit () {
  return rpc_call("ac/hitachi/deposit.cgi", {
    method: 'deposit',
    //description: 'Counts and identifies the banknotes in ESC.',
    params: {
      LDN: 'HCM2_01',
      testNotes, // 'true' (Test notes), 'false' (Real notes)
      excludeRoom1A: 'false', // 'true' (set storage as <Unavailable>), 'false'
      excludeRoom2A: 'false', // 'true' (set storage as <Unavailable>), 'false'
      excludeRoom3A: 'false', // 'true' (set storage as <Unavailable>), 'false'
      excludeRoom4A: 'false', // 'true' (set storage as <Unavailable>), 'false'
      excludeRoom5A: 'false', // 'true' (set storage as <Unavailable>), 'false'
      excludeRoom1B: 'true', // 'true' (set storage as <Unavailable>), 'false'
      excludeRoom1C: 'true', // 'true' (set storage as <Unavailable>), 'false'
      excludeRoomURJB: 'true', // 'true' (set storage as <Unavailable>), 'false'
    }
  })
  .then(body => bodyOrThrow('deposit', body))
  .then(body => this.emit('billsValid'))
  .catch(err => console.trace(err))
  // The box the notes were destined to were excluded with `excludeRoomXX`
  // commonErrorCode === '05' && commonErrorCodeDetail === '721503'
}

Hcm2.prototype.cashRollback = function cashRollback () {
  return rpc_call("ac/hitachi/cashRollback.cgi", {
    method: 'cashRollback',
    //description: 'Return the banknotes stacked in ESC to CS.',
    params: {
      LDN: 'HCM2_01',
      testNotes, // 'true' (Test notes), 'false' (Real notes)
    }
  })
  .then(body => bodyOrThrow('cashRollback', body))
}

Hcm2.prototype.dispenseByRoom = function dispenseByRoom (bills) {
  bills = _.map(i => _.toString(_.defaultTo(0, bills[i])), _.range(0, 4))
  return rpc_call("ac/hitachi/dispenseByRoom.cgi", {
    method: 'dispenseByRoom',
    //description: 'Feed the specified banknotes from specified room and transport them into CS.',
    params: {
      LDN: 'HCM2_01',
      testNotes, // 'true' (Test notes), 'false' (Real notes)
      NotesRoom2A: bills[0], // '0' - '200'
      NotesRoom3A: bills[1], // '0' - '200'
      NotesRoom4A: bills[2], // '0' - '200'
      NotesRoom5A: bills[3] // '0' - '200'
    }
  })
  .then(body => { // Passthrough potential errors since they'll be handled in a parent function
    if (body.result.error === 'OK') return body
    // Note shortage
    if (body.result.commonErrorCode === '93' && body.result.commonErrorCodeDetail === '010000') return body
    // TODO: bills rejected
    if (false) return this.retractEscrow().catch(console.log).then(() => body)
    return Promise.reject(body)
  })
}

Hcm2.prototype.retractEscrow = function retractEscrow () {
  return rpc_call("ac/hitachi/retractEscrow.cgi", {
    method: 'retractEscrow',
    //description: 'Feeds and validates the banknotes remained in ESC, and transports the all banknotes to destination for reject or dispense reject.',
    params: {
      LDN: 'HCM2_01',
      testNotes, // 'true' (Test notes), 'false' (Real notes)
      dispenseReject: 'true' // 'true'/'false'
    }
  }) // Passthrough potential errors since they'll be handled in a parent function
}

Hcm2.prototype.startUp = function startUp (cassettes) {
  return this.registerUSB()
    .then(() => this.getFirmwareVersion())
    .then(() => this.getInfo())
    .then(() => this.getBanknoteInfo(cassettes))
    .then(() => this.setDenomination())
    .then(() => this.setInfo())
    .then(() => this.reset('full'))
}

Hcm2.prototype.run = function run (cb, cassettes) {
  this.startUp(cassettes)
    .then(() => cb(null))
    .catch(cb)
}

Hcm2.prototype.reenable = function reenable () {
  return this.openCloseShutter(true)
}

Hcm2.prototype.enable = function enable () {}

Hcm2.prototype.disable = function disable () {
  return this.openCloseShutter(false)
}

Hcm2.prototype.reject = function reject () {
  return this.cashRollback()
}

Hcm2.prototype.lightOn = function lightOn () {
  console.log('HCM2: lightOn')
}

Hcm2.prototype.lightOff = function lightOff () {
  console.log('HCM2: lightOff')
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
  this.cassettes = data.cassettes
}

Hcm2.prototype.init = function init (data) {
  if (!this.initializing && !this.initialized) {
    this.initializing = true
    this._setup(data)
    this.initialized = true
    this.initializing = false
  }
  return Promise.resolve()
}

Hcm2.prototype.dispense = function dispense (notes) {
  return this.dispenseByRoom(notes)
    .then(res => ({
      error: getError('Dispensing', res),
      // TODO(siiky): Doesn't the order of the keys matter here?
      value: _.map(
        f => ({ dispensed: _.toNumber(res[f]), rejected: 0 }),
        ['DispenseCountRoom2A', 'DispenseCountRoom3A', 'DispenseCountRoom4A', 'DispenseCountRoom5A']
      ),
    }))
    // TODO(siiky):
    // error: 'Error:1907',
    // responseCode: '07',
    // responseCodeDescription: 'End with warning. Too many deposit rejects.',
    // commonErrorCode: '86',
    // commonErrorCodeDetail: '020000',
    // commonRecoveryCode: '0000',
    // TODO(siiky):
    // error: 'Error:1906',
    // responseCode: '06',
    // responseCodeDescription: 'End with warning. Notes condition error during feeding action.',
    // commonErrorCode: '88',
    // commonErrorCodeDetail: 'A15D20',
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

/*
 * Called after customer removes bills from the cash slot. All bills MUST be
 * removed from the cash slot, otherwise BAD THINGS WILL HAPPEN!
 */
Hcm2.prototype.cashSlotBillsRemoved = function () {
  return this.openCloseShutter(false)
    .then(() => this.status())
    .then(({ shutterAreaHasBanknotes, cashSlotHasBanknotes }) => {
      if (shutterAreaHasBanknotes || cashSlotHasBanknotes) return this.openCloseShutter(true)
      if (_.isEmpty(this.acceptedPending))
        this.emit('billsRejected')
      else
        this.emit('billsRead', this.acceptedPending)
      this.acceptedPending = []
    })
}

Hcm2.prototype.canSendCoins = function () {
  return this.openCloseShutter(false)
    .then(() => this.status())
    .then(({ shutterAreaHasBanknotes, cashSlotHasBanknotes }) => !shutterAreaHasBanknotes && !cashSlotHasBanknotes)
    .then(canSendCoins =>
      canSendCoins || this.openCloseShutter(true).then(() => false).catch(() => false)
    )
}

Hcm2.prototype.status = function () {
  return this.getFirmwareVersion(false)
    .then(({ shutterAreaHasBanknotes, cashSlotHasBanknotes }) => ({
      shutterAreaHasBanknotes: shutterAreaHasBanknotes === 'true',
      cashSlotHasBanknotes: cashSlotHasBanknotes === 'true',
    }))
}

function getError (action, res) {
  const cassetteErrorFields = [
    'commonCassette1Error',
    'commonCassette2Error',
    'commonCassette3Error',
    'commonCassette4Error',
    'commonCassette5Error',
  ]

  const errorFields = [
    'error',
    'responseCode',
    'responseCodeDescription',
    'commonErrorCode',
  ]

  const hasCassetteError = _.any(ce => res[ce] === 'true', cassetteErrorFields)
  const hasGenericError = !_.isNil(res.error) && res.error !== 'OK'

  if (hasCassetteError || hasGenericError)
    return new Error(`${action}, code: ${res.responseCode}, description: ${res.responseCodeDescription}`)

  return null
}

function bodyOrThrow (action, res) {
  const err = getError(action, res)
  return err ? Promise.reject(err) : Promise.resolve(res)
}

module.exports = Hcm2
