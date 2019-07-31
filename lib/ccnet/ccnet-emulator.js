const _ = require('lodash/fp')
const SerialPort = require('serialport')
const Crc = require('../id003/crc')
const { ADDRESS, SYNC, commands, responses, rejectingCodes, failingCodes } = require('./consts')

const cmdMap = _.invert(commands)
const respMap = _.invert(responses)

let response = responses.POWER_UP

var serial = new SerialPort('/dev/pts/1', {
  baudRate: 9600,
  parity: 'none',
  dataBits: 8,
  stopBits: 1,
  autoOpen: false,
  parser: SerialPort.parsers.raw
})

serial.open(err => {
  if (err) console.log('fail', err)

  serial.on('data', it => {
    const response = respond(it)
    if (response) serial.write(response)
  })
})

function buildResponse (data) {
  // SYNC = 1 byte, ADDRESS = 1 byte, length = 1 byte, crc = 2 bytes
  // totalling 5 extra bytes on data length
  const length = data.length + 5
  const message = Buffer.from([SYNC, ADDRESS, length].concat(data))

  const crc = Buffer.alloc(2)
  crc.writeUInt16LE(Crc.compute(message), 0)

  return Buffer.concat([message, crc])
}

function respond (data) {
  if (!validRequest(data)) return buildResponse([respMap.NAK])

  const payload = getPayload(data)
  const cmd = payload[0]

  if (!cmdMap[cmd]) return buildResponse([respMap.NAK])

  if (responses.ACK === cmd || responses.NAK === cmd) return null

  console.log(cmdMap[cmd])
  return fromRequest(cmd, payload)
}

function fromRequest (cmd, payload) {
  switch (cmd) {
    case commands.POLL[0]:
      return buildResponse([response])
    default:
      return buildResponse([responses.ACK])
  }
}

function validRequest (data) {
  return data && data[0] === SYNC && data[1] === ADDRESS &&
    data[2] === data.length && validCrc(data)
}

function validCrc (data) {
  var payloadCrc = data.readUInt16LE(data.length - 2)
  return Crc.compute(data.slice(0, -2)) === payloadCrc
}

function getPayload (data) {
  return data.slice(3, -2)
}

// TODO the basics are done, make it standard
(() => {
  setTimeout(() => {
    response = responses.INITIALIZE
  }, 5000)
  setTimeout(() => {
    response = responses.UNIT_DISABLED
  }, 10000)
})()
