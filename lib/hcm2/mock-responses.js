const _ = require('lodash/fp')

const initialState = {
  error: 'OK',
  responseCode: '00',
  responseCodeDescription: 'Normal End.',
  commonErrorCode: '00',
  commonErrorCodeDetail: '000000',
  commonRecoveryCode: '0000',
  commonCassette1Error: 'false',
  commonCassette2Error: 'false',
  commonCassette3Error: 'false',
  commonCassette4Error: 'false',
  commonCassette5Error: 'false',
  commonErrorPosition: 'None',
  commonTransportingPosition: 'None',
  CassDenomStatus: 'Not Yet Specified',
  CassDenom1A: '',
  CassDenom1B: '',
  CassDenom1C: '',
  CassDenom2A: '',
  CassDenom3A: '',
  CassDenom4A: '',
  CassDenom5A: '',
  CassTypeStatus: 'Not Yet Specified',
  CassType1: 'Unloaded',
  CassType2: 'Unloaded',
  CassType3: 'Unloaded',
  CassType4: 'Unloaded',
  CassType5: 'Unloaded',
  RoomOperation1A: 'Unloaded',
  RoomOperation1B: 'Unloaded',
  RoomOperation1C: 'Unloaded',
  RoomOperation2A: 'Unloaded',
  RoomOperation3A: 'Unloaded',
  RoomOperation4A: 'Unloaded',
  RoomOperation5A: 'Unloaded',
  NoteHandlingStatus: 'Not Yet Specified',
  NoteHandlingRoomsLeftInCashSlot: '',
  NoteHandlingRoomsDepositRejects: '',
  NoteHandlingRoomsDispenseRejects: '',
  DenomCodeSettings: 'NoteId1:1,NoteId2:2,NoteId3:3,NoteId4:4,NoteId5:5,NoteId6:6,NoteId7:7,NoteId8:8,NoteId9:9,NoteId10:10,NoteId11:11,NoteId12:12,NoteId13:13,NoteId14:14,NoteId15:15,NoteId16:16,NoteId17:17',
  RepudiatedDenomCodes: '128',
  UnfitCashCountVerificationLevel: 'Nominal',
  UnfitCashCountMisshapen: 'No Check',
  UnfitCashCountMissingCorner: 'Nominal',
  UnfitCashCountSoiled: 'No Check',
  UnfitCashCountTaped: 'No Check',
  UnfitDepositVerificationLevel: 'Nominal',
  UnfitDepositMisshapen: 'No Check',
  UnfitDepositMissingCorner: 'No Check',
  UnfitDepositSoiled: 'No Check',
  UnfitDepositTaped: 'No Check',
  UnfitDispenseVerificationLevel: 'Nominal',
  UnfitDispenseMisshapen: 'No Check',
  UnfitDispenseMissingCorner: 'No Check',
  UnfitDispenseSoiled: 'No Check',
  UnfitDispenseTaped: 'No Check',
  TotalStackedNotesUpRejBox: '0',
  StackedNotesCashSlot: '0',
  StackedNotesEscrow: '0', // _.size(params.bills).toString(),
  StackedNotesURJB: '0',
  StackedNotes1A: '0',
  StackedNotes2A: '0',
  StackedNotes3A: '0',
  StackedNotes4A: '0',
  StackedNotes5A: '0',
  FedNotesCashSlot: '0', // _.size(params.bills).toString(),
  FedNotesEscrow: '0',
  FedNotes1A: '0',
  FedNotes2A: '0',
  FedNotes3A: '0',
  FedNotes4A: '0',
  FedNotes5A: '0',
  RejectedNotes: '0',
  StackedNotesByDenomAndDest: '', // _.join(',', _.map(it => `${it},Escrow,${_.size(_.filter(ite => ite === it, params.bills))}`, _.uniq(params.bills))) // '1,Escrow,1,3,Escrow,1,5,Escrow,1,7,Escrow,2',
}

const state = initialState

const getFirmwareVersion = (id, params) => {
  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'getFirmwareVersion',
    description: 'Returns the names of the loaded firmwares.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      bootFirmwareVersion: 'TS-P177-S10/010 00000101',
      fpgaFirmwareVersion: 'HCMFPGA- 00000001',
      mainFirmwareVersion: 'TS-P177-S10/221 00030400',
      authenticationFirmwareVersion: ' ',
      BV1FirmwareVersion: 'BVZ20UST AA000004',
      billValidatorType: 'BVZ20',
      billValidatorSerialNumber: ' 00312391',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None',
      cashSlotShutterStatus: 'Half Opened',
      shutterAreaHasBanknotes: 'false',
      cashSlotHasBanknotes: 'false',
      cashSlotBanknotesInWrongPosition: 'false',
      upperRejectBoxFull: 'false',
      upperRejectBoxEmpty: 'true',
      notesAreRejectedInCashCount: 'false',
      escrowIsFullForCashCount: 'false',
      upperRejectBoxDoorClosed: 'true',
      escrowDoorClosed: 'true',
      escrowInPosition: 'true',
      escrowStackAreaInRear: 'false',
      cashSlotInPosition: 'true',
      billValidatorFanError: 'false',
      billValidatorClosed: 'true',
      forcedOpeningOfShutterMonitored: 'false',
      forcedRemovalOfNotesFromCashSlot: 'false',
      notesLeftInCashSlot: 'false',
      notesInEscrow: 'false',
      requestOfReadStatusPermitted: 'false',
      operationalLogDataRequested: 'false',
      resetRequired: 'false',
      bvWarning: 'false',
      powerSaveModeStarted: 'false',
      escrowEmpty: 'true',
      escrowFull: 'false',
      upperUnitInPosition: 'true',
      lowerUnitInPosition: 'true',
      'cassette1MAB-AStatus': 'Normal',
      'cassette1MAB-BStatus': 'Normal',
      'cassette1MAB-CStatus': 'Disabled',
      cassette1ABStatus: 'Disabled',
      cassette2RBStatus: 'Disabled',
      cassette3RBStatus: 'Disabled',
      cassette4RBStatus: 'Disabled',
      cassette5RBStatus: 'Disabled',
      cassette1InPosition: 'true',
      cassette2InPosition: 'true',
      cassette3InPosition: 'true',
      cassette4InPosition: 'true',
      cassette5InPosition: 'true',
      rearDoorClosed: 'true',
      frontDoorClosed: 'true'
    }
  })
}

const getInfo = (id, params) => {
  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'getInfo',
    description: 'Get the hardware configuration and operational setting of HCM2.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None',
      CassDenomStatus: 'Not Yet Specified',
      CassDenom1A: state.CassDenom1A,
      CassDenom1B: state.CassDenom1B,
      CassDenom1C: state.CassDenom1C,
      CassDenom2A: state.CassDenom2A,
      CassDenom3A: state.CassDenom3A,
      CassDenom4A: state.CassDenom4A,
      CassDenom5A: state.CassDenom5A,
      CassTypeStatus: 'Not Yet Specified',
      CassType1: state.CassType1,
      CassType2: state.CassType2,
      CassType3: state.CassType3,
      CassType4: state.CassType4,
      CassType5: state.CassType5,
      RoomOperation1A: state.RoomOperation1A,
      RoomOperation1B: state.RoomOperation1B,
      RoomOperation1C: state.RoomOperation1C,
      RoomOperation2A: state.RoomOperation2A,
      RoomOperation3A: state.RoomOperation3A,
      RoomOperation4A: state.RoomOperation4A,
      RoomOperation5A: state.RoomOperation5A,
      NoteHandlingStatus: 'Not Yet Specified',
      NoteHandlingRoomsLeftInCashSlot: '',
      NoteHandlingRoomsDepositRejects: '',
      NoteHandlingRoomsDispenseRejects: '',
      DenomCodeSettings: 'NoteId1:1,NoteId2:2,NoteId3:3,NoteId4:4,NoteId5:5,NoteId6:6,NoteId7:7,NoteId8:8,NoteId9:9,NoteId10:10,NoteId11:11,NoteId12:12,NoteId13:13,NoteId14:14,NoteId15:15,NoteId16:16,NoteId17:17',
      RepudiatedDenomCodes: state.RepudiatedDenomCodes,
      UnfitCashCountVerificationLevel: state.UnfitCashCountVerificationLevel,
      UnfitCashCountMisshapen: state.UnfitCashCountMisshapen,
      UnfitCashCountMissingCorner: state.UnfitCashCountMissingCorner,
      UnfitCashCountSoiled: state.UnfitCashCountSoiled,
      UnfitCashCountTaped: state.UnfitCashCountTaped,
      UnfitDepositVerificationLevel: state.UnfitDepositVerificationLevel,
      UnfitDepositMisshapen: state.UnfitDepositMisshapen,
      UnfitDepositMissingCorner: state.UnfitDepositMissingCorner,
      UnfitDepositSoiled: state.UnfitDepositSoiled,
      UnfitDepositTaped: state.UnfitDepositTaped,
      UnfitDispenseVerificationLevel: state.UnfitDispenseVerificationLevel,
      UnfitDispenseMisshapen: state.UnfitDispenseMisshapen,
      UnfitDispenseMissingCorner: state.UnfitDispenseMissingCorner,
      UnfitDispenseSoiled: state.UnfitDispenseSoiled,
      UnfitDispenseTaped: state.UnfitDispenseTaped
    }
  })
}

const getBanknoteInfo = (id, params) => {
  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'getBanknoteInfo',
    description: 'Get the list of all Note IDs supported by the loaded BV firmware.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None',
      billValidatorType: 'BVZ20',
      billValidatorSerialNumber: ' 00312391',
      allNoteID: 'NoteId1,Cod:USD,Val:1,Ver:A,Bnk:,Wid:156,Len:66,NoteId2,Cod:USD,Val:2,Ver:A,Bnk:,Wid:156,Len:66,NoteId3,Cod:USD,Val:5,Ver:B,Bnk:,Wid:156,Len:66,NoteId4,Cod:USD,Val:10,Ver:B,Bnk:,Wid:156,Len:66,NoteId5,Cod:USD,Val:20,Ver:B,Bnk:,Wid:156,Len:66,NoteId6,Cod:USD,Val:50,Ver:B,Bnk:,Wid:156,Len:66,NoteId7,Cod:USD,Val:100,Ver:B,Bnk:,Wid:156,Len:66,NoteId8,Cod:USD,Val:5,Ver:C,Bnk:,Wid:156,Len:66,NoteId9,Cod:USD,Val:10,Ver:C,Bnk:,Wid:156,Len:66,NoteId10,Cod:USD,Val:20,Ver:C,Bnk:,Wid:156,Len:66,NoteId11,Cod:USD,Val:50,Ver:C,Bnk:,Wid:156,Len:66,NoteId12,Cod:USD,Val:100,Ver:C,Bnk:,Wid:156,Len:66,NoteId13,Cod:USD,Val:5,Ver:A,Bnk:,Wid:156,Len:66,NoteId14,Cod:USD,Val:10,Ver:A,Bnk:,Wid:156,Len:66,NoteId15,Cod:USD,Val:20,Ver:A,Bnk:,Wid:156,Len:66,NoteId16,Cod:USD,Val:50,Ver:A,Bnk:,Wid:156,Len:66,NoteId17,Cod:USD,Val:100,Ver:A,Bnk:,Wid:156,Len:66'
    }
  })
}

const setDenomination = (id, params) => {
  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'setDenomination',
    description: 'Assign Denomination code to each of Note IDs.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None'
    }
  })
}

const setInfo = (id, params) => {
  state.CassDenom1A = params.DenomCassette1A
  state.CassDenom2A = params.DenomCassette2A
  state.CassDenom3A = params.DenomCassette3A
  state.CassDenom4A = params.DenomCassette4A
  state.CassDenom5A = params.DenomCassette5A
  state.CassDenom1B = params.DenomCassette1B
  state.CassDenom1C = params.DenomCassette1C
  state.CassType1 = params.HardwareType1A
  state.CassType2 = params.HardwareType2A
  state.CassType3 = params.HardwareType3A
  state.CassType4 = params.HardwareType4A
  state.CassType5 = params.HardwareType5A
  state.RoomOperation1A = params.RoomOperation1A
  state.RoomOperation1B = params.RoomOperation1B
  state.RoomOperation1C = params.RoomOperation1C
  state.RoomOperation2A = params.RoomOperation2A
  state.RoomOperation3A = params.RoomOperation3A
  state.RoomOperation4A = params.RoomOperation4A
  state.RoomOperation5A = params.RoomOperation5A
  state.RepudiatedDenomCodes = params.RepudiatedDenoms
  state.UnfitCashCountVerificationLevel = params.CashCountVerificationLevel
  state.UnfitCashCountMisshapen = params.CashCountMisshapenUnfitLevel
  state.UnfitCashCountMissingCorner = params.CashCountMissingCornerUnfitLevel
  state.UnfitCashCountSoiled = params.CashCountSoiledUnfitLevel
  state.UnfitCashCountTaped = params.CashCountTapedUnfitLevel
  state.UnfitDepositVerificationLevel = params.DepositVerificationLevel
  state.UnfitDispenseVerificationLevel = params.DispenseVerificationLevel
  state.UnfitDispenseMisshapen = params.DispenseMisshapenUnfitLevel
  state.UnfitDispenseMissingCorner = params.DispenseMissingCornerUnfitLevel
  state.UnfitDispenseSoiled = params.DispenseSoiledUnfitLevel
  state.UnfitDispenseTaped = params.DispenseTapedUnfitLevel
  state.StackedNotes2A = params.StackedNotes2A
  state.StackedNotes3A = params.StackedNotes3A
  state.StackedNotes4A = params.StackedNotes4A
  state.StackedNotes5A = params.StackedNotes5A

  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'setInfo',
    description: 'Specify the hardware configuration and operational setting of HCM2.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      TotalStackedNotesURJB: '0',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None'
    }
  })
}

const reset = (id, params) => {
  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'reset',
    description: 'Issues the mechanical reset.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None',
      TotalStackedNotesUpRejBox: '0',
      StackedNotesCashSlot: state.StackedNotesCashSlot,
      StackedNotesEscrow: state.StackedNotesEscrow,
      StackedNotesURJB: state.StackedNotesURJB,
      StackedNotes1A: state.StackedNotes1A,
      StackedNotes2A: state.StackedNotes2A,
      StackedNotes3A: state.StackedNotes3A,
      StackedNotes4A: state.StackedNotes4A,
      StackedNotes5A: state.StackedNotes5A,
      FedNotesCashSlot: state.FedNotesCashSlot,
      FedNotesEscrow: state.FedNotesEscrow,
      FedNotes1A: state.FedNotes1A,
      FedNotes2A: state.FedNotes2A,
      FedNotes3A: state.FedNotes3A,
      FedNotes4A: state.FedNotes4A,
      FedNotes5A: state.FedNotes5A
    }
  })
}

const openCloseShutter = (id, params) => {
  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'openCloseShutter',
    description: 'Open or Close the CS shutter.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None'
    }
  })
}

const cashCount = (id, params) => {
  state.StackedNotesEscrow = _.size(params.bills).toString()
  state.FedNotesCashSlot = _.size(params.bills).toString()

  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'cashCount',
    description: 'Counts and validates the banknotes set in CS.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None',
      TotalStackedNotesUpRejBox: '0',
      StackedNotesCashSlot: '0',
      StackedNotesEscrow: state.StackedNotesEscrow,
      StackedNotesURJB: state.StackedNotesURJB,
      StackedNotes1A: state.StackedNotes1A,
      StackedNotes2A: state.StackedNotes2A,
      StackedNotes3A: state.StackedNotes3A,
      StackedNotes4A: state.StackedNotes4A,
      StackedNotes5A: state.StackedNotes5A,
      FedNotesCashSlot: state.FedNotesCashSlot,
      FedNotesEscrow: state.FedNotesEscrow,
      FedNotes1A: state.FedNotes1A,
      FedNotes2A: state.FedNotes2A,
      FedNotes3A: state.FedNotes3A,
      FedNotes4A: state.FedNotes4A,
      FedNotes5A: state.FedNotes5A,
      RejectedNotes: '0',
      StackedNotesByDenomAndDest: _.join(',', [
        `${state.CassDenom1A},1A,${state.StackedNotes1A}`,
        `${state.CassDenom2A},2A,${state.StackedNotes2A}`,
        `${state.CassDenom3A},3A,${state.StackedNotes3A}`,
        `${state.CassDenom4A},4A,${state.StackedNotes4A}`,
        `${state.CassDenom5A},5A,${state.StackedNotes5A}`,
        _.map(it => `${it.denomination},Escrow,${_.size(_.filter(ite => ite.denomination === it.denomination, params.bills))}`, _.uniqBy(ite => ite.denomination, params.bills))
      ]), // '1,Escrow,1,3,Escrow,1,5,Escrow,1,7,Escrow,2',
      NoteConditionHalfNote: '',
      NoteConditionNotesRemainInCS: '',
      NoteConditionNoteShift: '',
      NoteConditionNonPick: '',
      NoteConditionTooLong: '',
      NoteConditionTooShort: '',
      NoteConditionNoteSkewed: '',
      NoteConditionMotorLostCalibration: ''
    }
  })
}

const deposit = (id, params) => {
  let mutableBills = _.clone(params.bills)
  const cassette2ABills = _.defaultTo('0', _.filter(it => it.denomination.toString() === (_.find(ite => ite.cassetteName === '2A', params.cassettes) && _.find(ite => ite.cassetteName === '2A', params.cassettes).denomination.toString()), params.bills))
  const cassette3ABills = _.defaultTo('0', _.filter(it => it.denomination.toString() === (_.find(ite => ite.cassetteName === '3A', params.cassettes) && _.find(ite => ite.cassetteName === '3A', params.cassettes).denomination.toString()), params.bills))
  const cassette4ABills = _.defaultTo('0', _.filter(it => it.denomination.toString() === (_.find(ite => ite.cassetteName === '4A', params.cassettes) && _.find(ite => ite.cassetteName === '4A', params.cassettes).denomination.toString()), params.bills))
  const cassette5ABills = _.defaultTo('0', _.filter(it => it.denomination.toString() === (_.find(ite => ite.cassetteName === '5A', params.cassettes) && _.find(ite => ite.cassetteName === '5A', params.cassettes).denomination.toString()), params.bills))
  state.StackedNotesEscrow = '0'
  state.FedNotesCashSlot = '0'
  state.FedNotesEscrow = _.size(params.bills).toString()

  console.log('cassette2ABills', cassette2ABills)
  console.log('cassette3ABills', cassette3ABills)
  console.log('cassette4ABills', cassette4ABills)
  console.log('cassette5ABills', cassette5ABills)

  if (Number(state.StackedNotes2A) + _.size(cassette2ABills) <= 500) {
    state.StackedNotes2A = (Number(state.StackedNotes2A) + _.size(cassette2ABills)).toString()
    mutableBills = _.difference(mutableBills, cassette2ABills)
  }

  if (Number(state.StackedNotes3A) + _.size(cassette3ABills) <= 500) {
    state.StackedNotes3A = (Number(state.StackedNotes3A) + _.size(cassette3ABills)).toString()
    mutableBills = _.difference(mutableBills, cassette3ABills)
  }

  if (Number(state.StackedNotes4A) + _.size(cassette4ABills) <= 500) {
    state.StackedNotes4A = (Number(state.StackedNotes4A) + _.size(cassette4ABills)).toString()
    mutableBills = _.difference(mutableBills, cassette4ABills)
  }

  if (Number(state.StackedNotes5A) + _.size(cassette5ABills) <= 500) {
    state.StackedNotes5A = (Number(state.StackedNotes5A) + _.size(cassette5ABills)).toString()
    mutableBills = _.difference(mutableBills, cassette5ABills)
  }

  state.StackedNotes1A = (Number(state.StackedNotes1A) + _.size(mutableBills)).toString()

  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'deposit',
    description: 'Counts and identifies the banknotes in ESC.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None',
      TotalStackedNotesUpRejBox: '0',
      StackedNotesCashSlot: state.StackedNotesCashSlot,
      StackedNotesEscrow: state.StackedNotesEscrow,
      StackedNotesURJB: state.StackedNotesURJB,
      StackedNotes1A: state.StackedNotes1A,
      StackedNotes2A: state.StackedNotes2A,
      StackedNotes3A: state.StackedNotes3A,
      StackedNotes4A: state.StackedNotes4A,
      StackedNotes5A: state.StackedNotes5A,
      FedNotesCashSlot: state.FedNotesCashSlot,
      FedNotesEscrow: state.FedNotesEscrow,
      FedNotes1A: state.FedNotes1A,
      FedNotes2A: state.FedNotes2A,
      FedNotes3A: state.FedNotes3A,
      FedNotes4A: state.FedNotes4A,
      FedNotes5A: state.FedNotes5A,
      StackedNotesByDenomAndDest: _.join(',', _.map(it => `${it.denomination},1A,${_.size(_.filter(ite => ite.denomination === it.denomination, params.bills))}`, _.uniqBy(ite => ite.denomination, params.bills))), // '7,1A,2,1,2A,1,3,3A,1,5,5A,1'
      UnfitNotesByDenomAndDest: '',
      RejectedNotesByDenomAndDest: '' // '7,1A,2'
    }
  })
}

const cashRollback = (id, params) => {
  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'cashRollback',
    description: 'Return the banknotes stacked in ESC to CS.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None',
      TotalStackedNotesUpRejBox: '0',
      StackedNotesCashSlot: state.StackedNotesCashSlot,
      StackedNotesEscrow: state.StackedNotesEscrow,
      StackedNotesURJB: state.StackedNotesURJB,
      StackedNotes1A: state.StackedNotes1A,
      StackedNotes2A: state.StackedNotes2A,
      StackedNotes3A: state.StackedNotes3A,
      StackedNotes4A: state.StackedNotes4A,
      StackedNotes5A: state.StackedNotes5A,
      FedNotesCashSlot: state.FedNotesCashSlot,
      FedNotesEscrow: state.FedNotesEscrow,
      FedNotes1A: state.FedNotes1A,
      FedNotes2A: state.FedNotes2A,
      FedNotes3A: state.FedNotes3A,
      FedNotes4A: state.FedNotes4A,
      FedNotes5A: state.FedNotes5A,
      StackedNotesByDenomAndDest: '7,Cash Slot,2'
    }
  })
}

const dispenseByRoom = (id, params) => {
  return JSON.stringify({
    id,
    jsonrpc: '2.0',
    method: 'dispenseByRoom',
    description: 'Feed the specified banknotes from specified room and transport them into CS.',
    result: {
      LDN: params.LDN,
      error: 'OK',
      responseCode: '00',
      responseCodeDescription: 'Normal End.',
      commonErrorCode: '00',
      commonErrorCodeDetail: '000000',
      commonRecoveryCode: '0000',
      commonCassette1Error: 'false',
      commonCassette2Error: 'false',
      commonCassette3Error: 'false',
      commonCassette4Error: 'false',
      commonCassette5Error: 'false',
      commonErrorPosition: 'None',
      commonTransportingPosition: 'None',
      RequestCountRoom2A: '1',
      RequestCountRoom3A: '1',
      RequestCountRoom4A: '1',
      RequestCountRoom5A: '1',
      DispenseCountRoom2A: '1',
      DispenseCountRoom3A: '1',
      DispenseCountRoom4A: '1',
      DispenseCountRoom5A: '1',
      TotalStackedNotesUpRejBox: '0',
      StackedNotesCashSlot: '4',
      StackedNotesEscrow: '0',
      StackedNotesURJB: '0',
      StackedNotes1A: '0',
      StackedNotes2A: '0',
      StackedNotes3A: '0',
      StackedNotes4A: '0',
      StackedNotes5A: '0',
      FedNotesCashSlot: '0',
      FedNotesEscrow: '0',
      FedNotes1A: '0',
      FedNotes2A: '1',
      FedNotes3A: '1',
      FedNotes4A: '1',
      FedNotes5A: '1',
      StackedNotesByDenomAndDest: '1,Cash Slot,1,3,Cash Slot,1,4,Cash Slot,1,5,Cash Slot,1',
      RejectedNotesByDenomAndSource: '',
      RejectedNotesByDenomAndDest: '',
      MisfedNotes: ''
    }
  })
}

module.exports = {
  getFirmwareVersion,
  getInfo,
  getBanknoteInfo,
  setDenomination,
  setInfo,
  reset,
  openCloseShutter,
  cashCount,
  deposit,
  cashRollback,
  dispenseByRoom
}
