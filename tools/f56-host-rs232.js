'use strict'

const serialPort = require('serialport')
const SerialPort = serialPort.SerialPort
const EventEmitter = require('events')
const fsm = require('../lib/f56/f56-fsm')
const R = require('ramda')

const serialOptions = {baudRate: 9600, parity: 'even', dataBits: 8, stopBits: 1}

class Emitter extends EventEmitter {}
const emitter = new Emitter()

const FS = new Buffer([0x1c])

var serial

function create (device) {
  serial = new SerialPort(device, serialOptions, false)

  return new Promise((resolve, reject) => {
    serial.open(error => {
      if (error) return reject(error)

      console.log('INFO Connected')
      serial.on('data', data => parse(data))
      serial.on('close', () => emitter.emit('disconnected'))
      resolve()
    })
  })
}

function parse (buf) {
  console.log(buf.toString('hex'))
  for (let byte of buf) {
    fsm.rx(byte)
  }
}

fsm.on('frame', processFrame)

fsm.on('send', s => {
  console.log('sending: %s', prettyHex(s))
  serial.write(s)
})

const device = process.argv[2]
create(device)
.then(console.log)

function processFrame (frame) {
  fsm.tx(buildResponse(frame))
}

function buildResponse (frame) {
  const commandSlice = frame.slice(0, 3)

  function matches (arr) {
    const buf = new Buffer(arr)
    return buf.equals(commandSlice)
  }

  if (matches([0x60, 0x02, 0x0d])) {
    return initialize()
  }

  if (matches([0x60, 0x03, 0x15])) {
    return billCount(frame)
  }

  console.error('Unknown command')
}

function billCount (frame) {
  const buf = new Buffer(139)
  buf.fill()

  const count0 = DP(frame.slice(4, 6))
  const count1 = DP(frame.slice(6, 8))

  console.log(frame.slice(4, 8).toString('hex'))
  console.log(count0)
  console.log(count1)
  console.log(D(count0))

  const command = [0xe0, 0x03, 0x99]
  const reject1 = Math.floor(count1 / 3)
  const dispense1 = count1 - reject1
  const counted = [D(count0), D(dispense1), D(0), D(0)]
  const rejected = [D(0), D(reject1), D(0), D(0)]
  const body = new Buffer(R.flatten([counted, rejected]))
  new Buffer(command).copy(buf)
  body.copy(buf, 0x27)
  FS.copy(buf, 138)

  return buf
}

function initialize () {
  const buf = new Buffer(56)
  buf.fill()
  const header = new Buffer([0xe0, 0x02, 0x34])
  header.copy(buf)
  FS.copy(buf, 55)

  return buf
}

function prettyHex (buf) {
  const pairs = []
  for (let i = 0; i < buf.length; i++) {
    pairs.push((buf.slice(i, i + 1).toString('hex')))
  }

  return pairs.join(' ')
}

function parity (x) {
  let y
  y = x ^ (x >> 1)
  y = y ^ (y >> 2)
  y = y ^ (y >> 4)
  y = y ^ (y >> 8)
  y = y ^ (y >> 16)
  return x + (y & 1) * 0x80
}

function D (n) {
  let str = n.toString(10)
  if (str.length === 1) str = '0' + str
  return [parity(str.charCodeAt(0)), parity(str.charCodeAt(1))]
}

function DP (buf) {
  const str = String.fromCharCode(buf[0] & 0x7f, buf[1] & 0x7f)
  return parseInt(str, 10)
}
