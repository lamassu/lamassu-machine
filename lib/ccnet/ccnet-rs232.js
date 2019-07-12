const SerialPort = require('serialport')
const EventEmitter = require('events')

const Crc = require('../id003/crc')
const transmissionFsm = require('./transmission-fsm')
const { SYNC, ADDRESS, commands } = require('./consts')

class Emitter extends EventEmitter {}
const emitter = new Emitter()

const serialOptions = {
  baudRate: 9600,
  parity: 'none',
  dataBits: 8,
  stopBits: 1,
  autoOpen: false,
  parser: SerialPort.parsers.raw
}

let buf = Buffer.alloc(0)
let serial

function create (device) {
  return new Promise((resolve, reject) => {
    serial = new SerialPort(device, serialOptions, false)
    serial.open(error => {
      if (error) return reject(error)

      console.log('INFO CCNET Connected')
      serial.on('data', data => _process(data))
      serial.on('close', () => emitter.emit('disconnected'))
      resolve()
    })
  })
}

function _process (data) {
  buf = Buffer.concat([buf, data])
  while (_processPacket()) {}
}

function _processPacket () {
  if (buf.length === 0) return
  buf = _acquireSync(buf)

  // Wait for size byte
  if (buf.length < 3) return

  const responseSize = buf[2]

  // Wait for whole packet
  if (buf.length < responseSize) return

  var packet = buf.slice(0, responseSize)
  buf = buf.slice(responseSize)

  emitter.emit('frame', packet)

  return true
}

function _acquireSync (data) {
  var payload = null
  for (var i = 0; i < data.length; i++) {
    if (data[i] === SYNC) {
      payload = data.slice(i)
      break
    }
  }

  return (payload || Buffer.alloc(0))
}

function buildRequest (data) {
  const length = data.length + 5
  const message = Buffer.concat([Buffer.from([SYNC, ADDRESS, length]), Buffer.from(data)])

  const crc = Buffer.alloc(2)
  crc.writeUInt16LE(Crc.compute(message), 0)

  return Buffer.concat([message, crc])
}

function request (command) {
  if (transmissionFsm.state !== 'Idle') {
    if (command === commands.POLL) return
    return emitter.emit('error', `Can't send in state: ${transmissionFsm.state}`)
  }

  emitter.once('frame', frame => transmissionFsm.handle('frame', frame))
  const sendPointer = transmissionFsm.on('send', it => serial.write(buildRequest(it)))

  const statusPointer = transmissionFsm.on('status', (status, frame) => {
    statusPointer.off()
    sendPointer.off()

    if (status === 'ack') return
    if (status === 'Response') {
      return emitter.emit('handleResponse', frame, command)
    }

    emitter.emit('error', status)
  })

  transmissionFsm.handle('waitForResponse')
  serial.write(buildRequest(command))
}

function close (cb) {
  serial.close(cb)
}

module.exports = {
  create,
  close,
  request,
  emitter
}
