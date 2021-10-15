'use strict'

const SerialPort = require('serialport')
const EventEmitter = require('events')
const fsm = require('./f56-fsm')
const dLevelFsm = require('./f56-dlevel-fsm')
const _ = require('lodash/fp')
const bills = require('./bills')
const serialOptions = {baudRate: 9600, parity: 'even', dataBits: 8, stopBits: 1, autoOpen: false}
const FS = 0x1c

var serial

class Emitter extends EventEmitter {}
const emitter = new Emitter()

const MAX_SUPPORTED_CASSETTES = 4

function create (device) {
  return new Promise((resolve, reject) => {
    serial = new SerialPort(device, serialOptions, false)
    serial.open(error => {
      if (error) return reject(error)

      console.log('INFO F56 Connected')
      serial.on('data', data => parse(data))
      serial.on('close', () => emitter.emit('disconnected'))
      resolve()
    })
  })
}

function parse (buf) {
  for (let byte of buf) {
    fsm.rx(byte)
  }
}

function initialize (currency, denominations) {
  const billData = bills[currency]

  _.forEach(it => {
    if (!billData.lengths[denominations[it]]) {
      throw new Error(`Unsupported denomination: ${denominations[it]} for fiat code: ${currency}`)
    }
  }, _.times(_.identity(), _.size(denominations)))

  const ODR = billData.polymer ? 0x40 : 0x00
  const lengths = []
  _.forEach(
    it =>
      !_.isNil(billData.lengths[denominations[it]]) ?
      lengths.push(billData.lengths[denominations[it]]) :
      lengths.push(0x00, 0x00),
    _.times(_.identity(), MAX_SUPPORTED_CASSETTES))
  const thicknesses = _.times(_.constant(billData.thickness), MAX_SUPPORTED_CASSETTES)
  const command = Buffer.from(_.flattenDeep([0x60, 0x02, 0x0d, ODR, lengths, thicknesses, FS]))

  return request(command)
    .then(res => {
      if (res[0] === 0xf0) {
        const errorCode = res.slice(3,5)
        throw new Error(`F56 error code: ${prettyHex(errorCode)}`)
      }

      if (res[1] !== 0x02 || res[2] !== 0x34) throw new Error('Invalid F56 response header')
    })
}

function billCount (counts) {
  const actualCounts = _.map(it => !_.isNil(counts[it]) ? counts[it] : 0, _.times(_.identity(), MAX_SUPPORTED_CASSETTES))
  return Promise.resolve()
    .then(() => {
      const ODR = 0xe4
      const billCounts = [D(actualCounts[0]), D(actualCounts[1]), D(actualCounts[2]), D(actualCounts[3])]
      const rejects = [D(4), D(4), D(4), D(4)]
      const retries = [3, 3, 3, 3]
      const command = Buffer.from(_.flattenDeep([0x60, 0x03, 0x15, ODR, billCounts, rejects, retries, FS]))

      return command
    })
    .then(command => request(command))
    .then(res => {
      if (res[1] !== 0x03 || res[2] !== 0x99) throw new Error('Invalid F56 response header')

      const response = {
        bills: []
      }

      _.forEach(it => response.bills.push({
        dispensed: DP(res.slice(0x27 + 2 * it, 0x29 + 2 * it)),
        rejected: DP(res.slice(0x2f + 2 * it, 0x31 + 2 * it))
      }), _.times(_.identity(), _.size(counts)))

      if (res[0] === 0xf0) {
        console.log('response', res)
        const errorCode = res.slice(3, 5)
        response.error = new Error(`Dispensing, code: ${prettyHex(errorCode)}`)
        console.error(`found error code: prettyHex(errorCode)`)
      }

      return response
    })
}

function billsPresent () {
  const command = Buffer.from(_.flattenDeep([0x00, 0x01, FS]))

  return request(command)
    .then(res => {
      if (res[0] === 0xf0) {
        const errorCode = res.slice(3,5)
        console.error(`F56 Error with code ${prettyHex(errorCode)}`)
        console.error(prettyHex(res))

        throw new Error('F56 Error')
      }

      const sensorRegister = res.slice(0x0c, 0x12)

      return (sensorRegister[2] & 0x10) > 0
    })
}

function request (command) {
  return new Promise((resolve, reject) => {
    if (dLevelFsm.state !== 'Idle') {
      const error = new Error('Can\'t send in state: ' + dLevelFsm.state)
      error.code = 'DLEVEL_FSM_ERROR'
      return reject(error)
    }

    const rs232StatusPointer = fsm.on('status', status => dLevelFsm.handle(status))
    const rs232FramePointer = fsm.on('frame', frame => dLevelFsm.handle('frame', frame))

    const statusPointer = dLevelFsm.on('status', (status, frame) => {
      rs232FramePointer.off()
      rs232StatusPointer.off()
      statusPointer.off()
      if (status === 'Response') return resolve(frame)
      if (status === 'Response Timeout') {
        const error = new Error('Response Timeout')
        error.code = 'RESPONSE_TIMEOUT'
        return reject(error)
      }
      return reject(new Error(status))
    })

    fsm.tx(command)
    dLevelFsm.handle('waitForResponse')
    fsm.tx(command)
  })
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

fsm.on('send', s => {
  serial.write(s)
})

function close () {
  serial.close()
}

module.exports = {
  create,
  initialize,
  billCount,
  billsPresent,
  close
}
