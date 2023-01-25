const uuid = require('uuid')
const got = require('got')
const _ = require('lodash/fp')
const pDelay = require('delay')

const BN = require('../bn')

const getID = () => ""

const Hcm2 = function (config) {
  this.name = 'HCM2'
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

Hcm2.factory = function factory (config) {
  return new Hcm2(config)
}

Hcm2.prototype.setFiatCode = function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
}

Hcm2.prototype.hasDenominations = function hasDenominations () {
  return this.denominations !== null
}

Hcm2.prototype.getFirmwareVersion = function getFirmwareVersion () {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/getFirmwareVersion.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'getFirmwareVersion',
        description: 'Returns the names of the loaded firmwares.',
        params: {
          LDN: 'HCM2_01',
          initial: 'true'
        },
        id: getID(),
      }
    }
  ).then(({ body }) => bodyOrThrow('GetFirmwareVersion', body))
}

Hcm2.prototype.getInfo = function getInfo () {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/getInfo.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'getInfo',
        description: 'Get the hardware configuration and operational setting of HCM2.',
        params: {
          LDN: 'HCM2_01'
        },
        id: getID(),
      }
    }
  ).then(({ body }) => {
    bodyOrThrow('GetInfo', body)
    const denomCodeSettingsPairs = body['DenomCodeSettings'].split(',')
    const denomCodeSettings = _.fromPairs(_.map(_.flow([_.replace(new RegExp('NoteId', 'g'), ''), _.split(':')]), denomCodeSettingsPairs))
    this.denomCodeSettings = denomCodeSettings
  })
}

Hcm2.prototype.getBanknoteInfo = function getBanknoteInfo (cassettes = []) {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/getBanknoteInfo.cgi',

    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'getBanknoteInfo',
        description: 'Get the list of all Note IDs supported by the loaded BV firmware.',
        params: {
          LDN: 'HCM2_01'
        },
        id: getID(),
      }
    }
  ).then(({ body }) => {
    bodyOrThrow('GetBanknoteInfo', body)
    const validNoteIds = _.flow([
      _.replace(new RegExp('NoteId', 'g'), 'Id:'),
      _.split(','),
      _.map(_.split(':')),
      _.chunk(7),
      _.map(_.fromPairs)
    ])(body['allNoteID'])
    this.allNoteIds = validNoteIds
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
  return got.post(
    'http://localhost:8081/api/ac/hitachi/setDenomination.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'setDenomination',
        description: 'Assign Denomination code to each of Note IDs.',
        params: {
          LDN: 'HCM2_01',
          noteIDs: [
            { noteId: 1, denomCode: 1 },
            { noteId: 2, denomCode: 2 },
            { noteId: 3, denomCode: 3 },
            { noteId: 4, denomCode: 4 },
            { noteId: 5, denomCode: 5 },
            { noteId: 6, denomCode: 6 },
            { noteId: 7, denomCode: 7 },
            { noteId: 8, denomCode: 3 },
            { noteId: 9, denomCode: 4 },
            { noteId: 10, denomCode: 5 },
            { noteId: 11, denomCode: 6 },
            { noteId: 12, denomCode: 7 },
            { noteId: 13, denomCode: 3 },
            { noteId: 14, denomCode: 4 },
            { noteId: 15, denomCode: 5 },
            { noteId: 16, denomCode: 6 },
            { noteId: 17, denomCode: 7 }
          ]
        },
        id: getID(),
      }
    }
  ).then(({ body }) => bodyOrThrow('SetDenomination', body))
}

Hcm2.prototype.setInfo = function setInfo () {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/setInfo.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'setInfo',
        description: 'Specify the hardware configuration and operational setting of HCM2.',
        params: {
          LDN: 'HCM2_01',
          IsMAB: 'true', // 'true' or 'false'
          DateTime: new Date().toISOString(), // 'YYMMDDhhmmss'
          TotalStackedNotesURJB: '0', // '0' - '2000'
          TotalStackedNotesONE_A: '0', // '0' - '2000'
          TotalStackedNotesONE_B: '0', // '0' - '2000'
          LaneExists1: 'true', // 'true' or 'false'
          LaneExists2: 'true', // 'true' or 'false'
          LaneExists3: 'true', // 'true' or 'false'
          LaneExists4: 'true', // 'true' or 'false'
          LaneExists5: 'true', // 'true' or 'false'
          DenomCassette1A: 'Unknown', // 'Unknown'
          DenomCassette2A: _.defaultTo('0', _.defaultTo({}, _.find(it => it.cassetteName === '2A', this.cassettes)).noteId), // '1', // list of denoms with COMMA separator (max.16 values: 0-128)
          DenomCassette3A: _.defaultTo('0', _.defaultTo({}, _.find(it => it.cassetteName === '3A', this.cassettes)).noteId), // '3', // list of denoms with COMMA separator (max.16 values: 0-128)
          DenomCassette4A: _.defaultTo('0', _.defaultTo({}, _.find(it => it.cassetteName === '4A', this.cassettes)).noteId), // '4', // list of denoms with COMMA separator (max.16 values: 0-128)
          DenomCassette5A: _.defaultTo('0', _.defaultTo({}, _.find(it => it.cassetteName === '5A', this.cassettes)).noteId), // '5', // list of denoms with COMMA separator (max.16 values: 0-128)
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
        },
        id: getID(),
      }
    }
  ).then(({ body }) => bodyOrThrow('SetInfo', body))
}

Hcm2.prototype.reset = function reset (mode) {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/reset.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'reset',
        description: 'Issues the mechanical reset.',
        params: {
          LDN: 'HCM2_01',
          mode: mode // 'full', 'saving', 'quick'
        },
        id: getID(),
      }
    }
  ).then(({ body }) => bodyOrThrow('Reset', body))
}

Hcm2.prototype.openCloseShutter = function openCloseShutter (open) {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/openCloseShutter.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'openCloseShutter',
        description: 'Open or Close the CS shutter.',
        params: {
          LDN: 'HCM2_01',
          open: open ? 'true' : 'false', // 'true' (Open), 'false' (Close)
          retry: 'false' // 'true' (Force shutter close), 'false'
        },
        id: getID(),
      }
    }
  ).then(({ body }) => bodyOrThrow('OpenCloseShutter', body))
}

Hcm2.prototype.cashCount = function cashCount () {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/cashCount.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'cashCount',
        description: 'Counts and validates the banknotes set in CS.',
        params: {
          LDN: 'HCM2_01',
          testNotes: 'false', // 'true' (Test notes), 'false' (Real notes)
        },
        id: getID(),
      }
    }
  ).then(({ body }) => bodyOrThrow('CashCount', body))
}

Hcm2.prototype.deposit = function deposit (bills) {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/deposit.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'deposit',
        description: 'Counts and identifies the banknotes in ESC.',
        params: {
          LDN: 'HCM2_01',
          testNotes: 'true', // 'true' (Test notes), 'false' (Real notes)
          excludeRoom1A: 'true', // 'true' (set storage as <Unavailable>), 'false'
          excludeRoom2A: 'true', // 'true' (set storage as <Unavailable>), 'false'
          excludeRoom3A: 'true', // 'true' (set storage as <Unavailable>), 'false'
          excludeRoom4A: 'true', // 'true' (set storage as <Unavailable>), 'false'
          excludeRoom5A: 'true', // 'true' (set storage as <Unavailable>), 'false'
          excludeRoom1B: 'true', // 'true' (set storage as <Unavailable>), 'false'
          excludeRoom1C: 'true', // 'true' (set storage as <Unavailable>), 'false'
          excludeRoomURJB: 'true', // 'true' (set storage as <Unavailable>), 'false'
        }
      }
    }
  ).then(({ body }) => bodyOrThrow('Deposit', body))
}

Hcm2.prototype.cashRollback = function cashRollback () {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/cashRollback.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'cashRollback',
        description: 'Return the banknotes stacked in ESC to CS.',
        params: {
          LDN: 'HCM2_01',
          testNotes: 'false' // 'true' (Test notes), 'false' (Real notes)
        },
        id: getID(),
      }
    }
  ).then(({ body }) => bodyOrThrow('CashRollback', body))
}

Hcm2.prototype.dispenseByRoom = function dispenseByRoom (bills) {
  return got.post(
    'http://localhost:8081/api/ac/hitachi/dispenseByRoom.cgi',
    {
      json: true,
      body: {
        jsonrpc: '2.0',
        method: 'dispenseByRoom',
        description: 'Feed the specified banknotes from specified room and transport them into CS.',
        params: {
          LDN: 'HCM2_01',
          testNotes: 'false', // 'true' (Test notes), 'false' (Real notes)
          NotesRoom2A: _.toString(bills[0]), // '0' - '200'
          NotesRoom3A: _.toString(bills[1]), // '0' - '200'
          NotesRoom4A: _.toString(bills[2]), // '0' - '200'
          NotesRoom5A: _.toString(bills[3]) // '0' - '200'
        },
        id: getID(),
      }
    }
  ).then(({ body }) => body) // Passthrough potential errors since they'll be handled in a parent function
}

Hcm2.prototype.startUp = function startUp (cassettes) {
  return this.getFirmwareVersion()
    .then(() => this.getInfo())
    .then(() => this.getBanknoteInfo(cassettes))
    .then(() => this.setDenomination())
    .then(() => this.setInfo())
    .then(() => this.getInfo())
    .then(() => this.reset('full'))
}

Hcm2.prototype.run = function run (cb, cassettes) {
  this.startUp(cassettes)
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
  console.log('HCM2: rolling back bills')
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

Hcm2.prototype.dispense = function dispense (notes) {
  return this.dispenseByRoom(notes)
    .then(res => ({
      error: getError('Dispensing', res),
      value: _.flow(
        // TODO(siiky): Doesn't the order of the keys matter here?
        _.pick([
          'DispenseCountRoom2A',
          'DispenseCountRoom3A',
          'DispenseCountRoom4A',
          'DispenseCountRoom5A',
        ]),
        _.toPairs,
        _.map(([k, v]) => ({ dispensed: _.toNumber(v), rejected: 0 }))
      )(res),
    }))
}

Hcm2.prototype.waitForBillsRemoved = function waitForBillsRemoved () {
  return pDelay(2000).then(_.stubTrue)
}

Hcm2.prototype.billsPresent = function billsPresent () {
  return pDelay(2000).then(_.stubFalse)
}

function getError (action, res) {
  const errorFields = _.pick([
    'error',
    'responseCode',
    'responseCodeDescription',
    'commonErrorCode',
    'commonCassette1Error',
    'commonCassette2Error',
    'commonCassette3Error',
    'commonCassette4Error',
    'commonCassette5Error',
  ], res)

  if (_.any(it => it === 'true', _.pick(['commonCassette1Error', 'commonCassette2Error', 'commonCassette3Error', 'commonCassette4Error', 'commonCassette5Error'], errorFields)) || errorFields.error !== 'OK') {
    return new Error(`${action}, code: ${errorFields.responseCode}, description: ${errorFields.responseCodeDescription}`)
  }

  return null
}

function bodyOrThrow (action, res) {
  const err = getError(action, res)
  if (err !== null) throw err
  return res
}

module.exports = Hcm2
