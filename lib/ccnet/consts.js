const _ = require('lodash/fp')

const SYNC = 0x02
const ADDRESS = 0x03

const commands = {
  ACK: [0x00],
  NAK: [0xFF],
  RESET: [0x30],
  GET_STATUS: [0x31],
  SET_SECURITY: [0x32],
  POLL: [0x33],
  ENABLE_BILL_TYPES: [0x34],
  STACK: [0x35],
  RETURN: [0x36],
  IDENTIFICATION: [0x37],
  HOLD: [0x38],
  SET_BARCODE_PARAMETERS: [0x39],
  EXTRACT_BARCODE_DATA: [0x3A],
  GET_BILL_TABLE: [0x41],
  DOWNLOAD: [0x50],
  GET_CRC32_OF_THE_CODE: [0x51],
  MODULE_DOWNLOAD: [0x52],
  VALIDATION_MODULE_IDENTIFICATION: [0x54],
  REQUEST_STATISTICS: [0x60],
  DIAGNOSTIC_SETTING: [0xF0]
}

const responses = {
  ACK: 0x00,
  NAK: 0xFF,
  ILLEGAL_COMMAND: 0x30,
  POWER_UP: 0x10,
  POWER_UP_WITH_BILL_IN_VALIDATOR: 0x11,
  POWER_UP_WITH_BILL_IN_STACKER: 0x12,
  INITIALIZE: 0x13,
  IDLING: 0x14,
  ACCEPTING: 0x15,
  STACKING: 0x17,
  RETURNING: 0x18,
  UNIT_DISABLED: 0x19,
  HOLDING: 0x1A,
  DEVICE_BUSY: 0x1B,
  REJECTING: 0x1C,
  DROP_CASSETTE_FULL: 0x41,
  DROP_CASSETTE_OUT_OF_POSITION: 0x42,
  VALIDATOR_JAMMED: 0x43,
  DROP_CASSETTE_JAMMED: 0x44,
  CHEATED: 0x45,
  PAUSE: 0x46,
  FAILED: 0x47,
  ESCROW_POSITION: 0x80,
  BILL_STACKED: 0x81,
  BILL_RETURNED: 0x82
}

const failingCodes = {
  0x50: 'Stack Motor Failure. Drop Cassette Motor failure',
  0x51: 'Transport Motor Speed Failure.',
  0x52: 'Transport Motor Failure',
  0x53: 'Aligning Motor Failure',
  0x54: 'Initial Cassette Status Failure',
  0x55: 'Optic Canal Failure',
  0x56: 'Magnetic Canal Failure',
  0x5F: 'Capacitance Canal Failure'
}

const rejectingCodes = {
  0x60: 'Rejecting due to Insertion. Insertion error',
  0x61: 'Rejecting due to Magnetic. Magnetic error',
  0x62: 'Rejecting due to bill Remaining in the head. Bill remains in the head, and new bill is rejected.',
  0x63: 'Rejecting due to Multiplying. Compensation error/multiplying factor error',
  0x64: 'Rejecting due to Conveying. Conveying error',
  0x65: 'Rejecting due to Identification1. Identification error',
  0x66: 'Rejecting due to Verification. Verification error',
  0x67: 'Rejecting due to Optic. Optic error',
  0x68: 'Rejecting due to Inhibit. Returning by inhibit denomination error',
  0x69: 'Rejecting due to Capacity. Capacitance error',
  0x6A: 'Rejecting due to Operation. Operation error.',
  0x6C: 'Rejecting due to Length. Length error',
  0x6D: 'Rejecting due to UV optic. Banknote UV properties do not meet the predefined criteria',
  0x92: 'Rejecting due to unrecognised barcode. Bill taken was treated as a barcode but no reliable data can be read from it.',
  0x93: 'Rejecting due to incorrect number of characters in barcode. Barcode data was read (at list partially) but is inconsistent',
  0x94: 'Rejecting due to unknown barcode start sequence. Barcode was not read as no synchronization was established.',
  0x95: 'Rejecting due to unknown barcode stop sequence. Barcode was read but trailing data is corrupt.'
}

module.exports = {
  SYNC,
  ADDRESS,
  commands: _.mapValues(Buffer.from)(commands),
  responses,
  failingCodes,
  rejectingCodes
}
