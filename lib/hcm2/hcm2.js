'use strict'
const { default: Queue } = require('p-queue')
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

/*
 * NOTE: Even though there are TWO instances of the HCM2 in the Brain (as
 * validator and as dispenser), this should be enough because (generally?)
 * they're not used simultaneously.
 */
const rpcq = new Queue({ concurrency: 1, autostart: true, interval: 100 })

const PORT = 8081
const makeURL = endpoint => `http://localhost:${PORT}/api/${endpoint}`
const rpc_call = (path, body) =>
  rpcq.add(() => {
    console.log("calling", path, "with body =", body)
    return got.post(makeURL(path), {
      json: true,
      body: _.assign({ jsonrpc: '2.0', id: getID() }, body)
    })
    .then(resolve => ({ resolve }))
    .catch(reject => ({ reject }))
  })
  .then(({ resolve, reject }) => reject ? Promise.reject(reject) : Promise.resolve(resolve))
  .then(({ body: { error, result } }) => {
    console.log(path, "error =", error)
    console.log(path, "result =", result)
    return error ? Promise.reject(error) : Promise.resolve(result)
  })

const predictBillsDestinations = (recyclers, bills) => {
  const capacities = {
    'recycler1': 2800,
    'recycler2': 2800,
    'recycler3': 2800,
    'recycler4': 2800,
  }

  const findRecyclerByDenom = recyclers => denom =>
    _.find(({ denomination }) => denomination.eq(denom), recyclers)

  const predictBillDestination = (recyclers, bill) => _.flow(
    _.get(['denomination']),
    findRecyclerByDenom(
      _.filter(({ count, name }) => count < capacities[name], recyclers)
    ),
    _.defaultTo({ count: 0, name: 'cashbox' }),
  )(bill)

  return _.map(
    bill => {
      const destinationUnit = predictBillDestination(recyclers, bill)
      destinationUnit.count++
      return _.set('destinationUnit', destinationUnit.name, bill)
    },
    bills
  )
}

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
  this.dispenseLimit = 200

  this.acceptedPending = []
  this.leftoverBillsInCashSlot = false
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

Hcm2.prototype.getBanknoteInfo = function getBanknoteInfo (recyclers) {
  if (recyclers.length !== 4)
    return Promise.reject(new Error(`Expected 4 recyclers, got ${recyclers.length}`))

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
  .then(reply => bodyOrThrow('getBanknoteInfo', reply))
  .then(reply => {
    const validNoteIds = parseValidNoteIDs(reply.allNoteID)
    this.denominations = _.reduce((acc, it) => Object.assign(acc, { [it.Id]: it.Val }), {}, validNoteIds)
    this.recyclers = recyclers.map(
      recycler => {
        const noteId = _.findKey(denom => recycler.denomination.eq(denom), this.denominations)
        if (_.isNil(noteId)) throw new Error(`${recycler.name} has no configured denomination`)
        return _.set('noteId', noteId, recycler)
      }
    )
    return reply
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
  const getNoteIDByIdx = i => _.get([i, 'noteId'], this.recyclers)
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
      DenomCassette2A: getNoteIDByIdx(0), // '1', // list of denoms with COMMA separator (max.16 values: 0-128)
      DenomCassette3A: getNoteIDByIdx(1), // '3', // list of denoms with COMMA separator (max.16 values: 0-128)
      DenomCassette4A: getNoteIDByIdx(2), // '4', // list of denoms with COMMA separator (max.16 values: 0-128)
      DenomCassette5A: getNoteIDByIdx(3), // '5', // list of denoms with COMMA separator (max.16 values: 0-128)
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
      mode, // 'full', 'saving', 'quick'
    }
  })
  .then(reply => {
    this.leftoverBillsInCashSlot = reply.responseCode === '02' && _.includes(reply.commonErrorCode, ['81', '82'])
    if (this.leftoverBillsInCashSlot)
      this.emit('leftoverBillsInCashSlot')
    else
      bodyOrThrow('reset', reply)
  })
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

Hcm2.prototype.openShutter = function () {
  return this.openCloseShutter(true)
}

Hcm2.prototype.closeShutter = function () {
  return this.openCloseShutter(false)
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
  .then(reply => {
    const inserted = _.flow(
      _.get(['StackedNotesByDenomAndDest']),
      _.split(','),
      _.chunk(3),
      _.groupBy(([_noteId, destination, _count]) => destination),
    )(reply)

    const rejected = inserted['Cash Slot']

    const result = _.flow(
      _.omit('Cash Slot'),
      _.mapValues(
        _.flatMap(([noteId, destination, count]) => repeat(count, { denomination: this.denominations[noteId], destination })),
      )
    )(inserted)

    return { reply, result, rejected }
  })
  .then(({ reply, result, rejected }) => {
    /* TODO: what if deposited bills go to a different destination? */
    const accepted = predictBillsDestinations(this.recyclers, result.Escrow)
    this.acceptedPending = []
    if (_.isEmpty(accepted) && _.isEmpty(rejected)) {
      this.emit('billsRejected')
    } else if (!_.isEmpty(accepted) && _.isEmpty(rejected)) {
      this.emit('billsRead', accepted)
    } else {
      this.acceptedPending = accepted
      this.emit('cashSlotRemoveBills')
    }
    return { reply, result, rejected }
  })
  .then(({ reply }) =>
    reply.commonErrorCode === '84' && _.includes(reply.commonErrorCodeDetail, ['010000', '030000']) ? /* No notes in cash slot */
      null :
    reply.commonErrorCode === '8F' && reply.commonErrorCodeDetail === '010000' ? /* Some bills rejected */
      null :
    reply.commonErrorCode === '83' && reply.commonErrorCodeDetail === '020404' ? /* Note bundle too thick */
      null :
      bodyOrThrow('cashCount', reply)
  )
}

Hcm2.prototype.stack = function () {
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

Hcm2.prototype.run = function run (cb, { recyclers }) {
  return this.registerUSB()
    .then(() => this.getFirmwareVersion())
    .then(() => this.getInfo())
    .then(() => this.getBanknoteInfo(recyclers))
    .then(() => this.setDenomination())
    .then(() => this.setInfo())
    .then(() => this.reset('full'))
    .then(() => cb(null))
    .catch(err => {
      console.log(err)
      cb(err)
    })
}

Hcm2.prototype.reenable = function reenable () {
  return this.openShutter()
}

Hcm2.prototype.enable = function enable () {}

Hcm2.prototype.disable = function disable () {
  return this.closeShutter()
}

Hcm2.prototype.reject = function reject () {
  return this.cashRollback()
    .then(() => this.openShutter())
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
  return BN(_.min(_.isEmpty(filtered) ? bills : filtered))
}

Hcm2.prototype.highestBill = function highestBill (fiat) {
  return BN(_.flow(
    _.values,
    _.filter(bill => fiat.gte(bill)),
    _.max,
    _.defaultTo(-Infinity),
  )(this.denominations))
}

Hcm2.prototype._setup = function _setup ({ fiatCode, recyclers }) {
  this.fiatCode = fiatCode
  this.recyclers = recyclers
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

Hcm2.prototype.dispense = function dispense (bills) {
  const getNonIgnoredError = res => _.includes(res.commonErrorCode, ['8F']) ?
    null :
    getError('Dispensing', res)

  const getValue = res => _.map(
      f => {
        const dispensed = _.toNumber(_.get([`DispenseCountRoom${f}`], res))
        const fed = _.toNumber(_.get([`FedNotes${f}`], res))
        const rejected = fed - dispensed
        return { dispensed, rejected }
      },
      ['2A', '3A', '4A', '5A']
    )

  const shouldOpenShutter =   =>
    _.sumBy(_.get(['dispensed']), res.value) > 0

  const openShutter = res => shouldOpenShutter(res) ?
    this.openShutter().then(() => res) :
    res

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
  .then(result =>
    // Bills rejected
    (result.StackedNotesEscrow !== '0') ? // TODO: commonErrorCode
      this.retractEscrow().catch(console.log).then(() => result) :
      result
  })
    .then(res => ({
      error: getNonIgnoredError(res),
      value: getValue(res),
    }))
    .then(res => openShutter(res))
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
  return pDelay(2000)
    .then(() => this.cashSlotHasBills())
    .then(hasBills => hasBills ? this.waitForBillsRemoved() : null)
}

/*
 * Called after customer removes bills from the cash slot. All bills MUST be
 * removed from the cash slot, otherwise BAD THINGS WILL HAPPEN!
 */
Hcm2.prototype.cashSlotBillsRemoved = function () {
  return this.closeShutter()
    .then(() => this.cashSlotHasBills())
    .then(hasBills => {
      if (hasBills) return this.openShutter()
      if (_.isEmpty(this.acceptedPending))
        this.emit('billsRejected')
      else
        this.emit('billsRead', this.acceptedPending)
      this.acceptedPending = []
    })
}

Hcm2.prototype.leftoverBillsRemoved = function () {
  return this.closeShutter()
    .then(() => this.cashSlotHasBills())
    .then(leftoverBillsInCashSlot => {
      this.leftoverBillsInCashSlot = leftoverBillsInCashSlot
      if (this.leftoverBillsInCashSlot) this.emit('leftoverBillsInCashSlot')
      return !this.leftoverBillsInCashSlot
    })
}

Hcm2.prototype.canSendCoins = function () {
  return this.closeShutter()
    .then(() => this.cashSlotHasBills())
    .then(hasBills =>
      !hasBills || this.openShutter().then(() => false).catch(() => false)
    )
}

Hcm2.prototype.status = function () {
  return this.getFirmwareVersion(false)
    .then(({ shutterAreaHasBanknotes, cashSlotHasBanknotes }) => ({
      shutterAreaHasBanknotes: shutterAreaHasBanknotes === 'true',
      cashSlotHasBanknotes: cashSlotHasBanknotes === 'true',
    }))
}

Hcm2.prototype.cashSlotHasBills = function () {
  return this.status()
    .then(({ shutterAreaHasBanknotes, cashSlotHasBanknotes }) => shutterAreaHasBanknotes || cashSlotHasBanknotes)
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
