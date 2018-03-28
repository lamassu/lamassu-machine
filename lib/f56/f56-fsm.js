'use strict'

const machina = require('machina')
const crc = require('../id003/crc')

const STX = 0x02
const ETX = 0x03
const ENQ = 0x05
const ACK = 0x06
const NAK = 0x15
const DLE = 0x10

const DLE_STX = new Buffer([DLE, STX])
const DLE_ACK = new Buffer([DLE, ACK])
const DLE_NAK = new Buffer([DLE, NAK])
const DLE_ETX = new Buffer([DLE, ETX])
const DLE_ENQ = new Buffer([DLE, ENQ])

const dataStates = ['DataLength', 'DataBody', 'CRC']

const controlMap = {
  0x02: 'STX',
  0x03: 'ETX',
  0x05: 'ENQ',
  0x06: 'ACK',
  0x15: 'NAK',
  0x10: 'DLE'
}

const fsm = new machina.Fsm({
  initialState: 'Idle',
  states: {
    Idle: {
      // Note: This has to be a regular function and must use "this" because fsm
      // isn't defined yet.
      _onEnter: function () {
        this.retryDleAckCount = 0
        this.retryAckCount = 0
        this.transmitData = null
        this.dataLengthBuf = new Buffer(2)
      },
      'Send': data => {
        fsm.transmitData = data
        fsm.transition('DLE_ENQ_T')
      },
      DLE: 'ENQ',
      LineError: nakEnq
    },
    ENQ: {
      _onEnter: startTimer,
      ENQ: () => {
        fsm.emit('send', DLE_ACK)
        fsm.transition('DLE_STX')
      },
      Timeout: nakEnq,
      LineError: nakEnq,
      '*': 'Idle',
      _onExit: clearTimer
    },
    DLE_STX: {
      _onEnter: () => {
        startTimer()
        fsm.dataLengthPointer = 0
      },
      DLE: 'STX',
      Timeout: 'Idle',
      LineError: nakEnq,
      '*': 'ENQ',
      _onExit: clearTimer
    },
    STX: {
      _onEnter: startTimer,
      DLE: 'DLE_STX',
      ENQ: () => {
        fsm.emit('send', DLE_ACK)
        fsm.transition('DLE_STX')
      },
      STX: 'DataLength',
      '*': nakEnq,
      _onExit: clearTimer
    },
    DataLength: {
      _onEnter: startTimer,
      Timeout: nakStx,
      LineError: nakStx,
      Data: byte => {
        fsm.dataLengthBuf[fsm.dataLengthPointer++] = byte
        if (fsm.dataLengthPointer === 2) {
          const dataLength = fsm.dataLengthBuf.readUInt16BE(0)
          fsm.data = new Buffer(dataLength)
          fsm.dataPointer = 0
          fsm.crc = new Buffer(2)
          fsm.crcPointer = 0
          fsm.transition('DataBody')
        }
      },
      _onExit: clearTimer
    },
    DataBody: {
      _onEnter: startTimer,
      Timeout: nakStx,
      LineError: nakStx,
      Data: byte => {
        fsm.data[fsm.dataPointer++] = byte
        if (fsm.dataPointer === fsm.data.length) fsm.transition('DLE_ETX')
      },
      _onExit: clearTimer
    },
    DLE_ETX: {
      _onEnter: startTimer,
      DLE: 'ETX',
      '*': nakStx,
      _onExit: clearTimer
    },
    ETX: {
      _onEnter: startTimer,
      ETX: 'CRC',
      '*': nakStx,
      _onExit: clearTimer
    },
    CRC: {
      _onEnter: startTimer,
      Timeout: nakStx,
      LineError: nakStx,
      Data: byte => {
        fsm.crc[fsm.crcPointer++] = byte
        if (fsm.crcPointer === 2) fsm.transition('CRC_Check')
      },
      _onExit: clearTimer
    },
    CRC_Check: {
      _onEnter: () => {
        const buf = Buffer.concat([fsm.dataLengthBuf, fsm.data, DLE_ETX])
        const computedCrc = crc.compute(buf)

        if (fsm.crc.readUInt16LE(0) === computedCrc) {
          fsm.emit('send', DLE_ACK)
          fsm.emit('frame', fsm.data)
          fsm.deferAndTransition('Idle')
          return
        }

        console.log('DEBUG2: CRC failure')
        nakStx()
      }
    },
    DLE_ENQ_T: {
      _onEnter: () => {
        fsm.emit('send', DLE_ENQ)
        fsm.transition('DLE_ACK')
      }
    },
    DLE_ACK: {
      _onEnter: startTimer,
      DLE: 'ACK',
      Timeout: retryDleAck,
      LineError: retryDleAck,
      _onExit: clearTimer
    },
    ACK: {
      _onEnter: () => {
        startTimer()
        fsm.retryDleAckCount = 0
      },
      ENQ: 'DLE_ENQ_T',
      ACK: 'Transmit',
      Timeout: retryAck,
      LineError: retryAck,
      '*': 'DLE_ACK',
      _onExit: clearTimer
    },
    Transmit: {
      _onEnter: () => {
        resetRetry()
        fsm.retryAckCount = 0
        fsm.emit('send', fsm.transmitData)
        fsm.transition('DLE_ACK_2')
      }
    },
    DLE_ACK_2: {
      _onEnter: startTimer,
      DLE: 'ACK_2',
      Timeout: retryDleAck2,
      LineError: retryDleAck2,
      _onExit: clearTimer
    },
    ACK_2: {
      _onEnter: () => {
        startTimer()
        fsm.retryDleAckCount = 0
      },
      ENQ: 'Idle',
      ACK: () => {
        fsm.emit('status', 'transmissionComplete')
        fsm.transition('Idle')
      },
      NAK: retryAck2,
      Timeout: retryAck2,
      LineError: retryAck2,
      '*': 'DLE_ACK_2',
      _onExit: clearTimer
    }
  },
  rx: function (byte) {
    if (dataStates.indexOf(this.state) > -1) {
      return this.handle('Data', byte)
    }

    const state = controlMap[byte]
    if (state) return this.handle(state)
    console.error('Unknown code: 0x%s', new Buffer([byte]).toString('hex'))
  },
  tx: function (packet) {
    this.handle('Send', buildFrame(packet))
  }
})

function resetRetry () {
  fsm.retryCount = 0
}

function retryDleAck2 () {
  fsm.retryDleAckCount = fsm.retryDleAckCount + 1
  if (fsm.retryDleAckCount < 3) return fsm.transition('Transmit')
  fsm.emit('status', 'transmissionFailure')
  fsm.transition('Idle')
}

function retryAck2 () {
  fsm.retryAckCount++
  if (fsm.retryAckCount < 3) return fsm.transition('Transmit')
  fsm.emit('status', 'transmissionFailure')
  fsm.transition('Idle')
}

function retryAck () {
  fsm.retryAckCount++
  if (fsm.retryAckCount < 3) return fsm.transition('DLE_ENQ_T')
  fsm.emit('status', 'transmissionFailure')
  fsm.transition('Idle')
}

function retryDleAck () {
  fsm.retryDleAckCount++
  if (fsm.retryDleAckCount < 3) return fsm.transition('DLE_ENQ_T')
  fsm.emit('status', 'transmissionFailure')
  fsm.transition('Idle')
}

function nakStx () {
  fsm.emit('send', DLE_NAK)
  fsm.transition('DLE_STX')
}

function nakEnq () {
  fsm.emit('NAK')
  fsm.transition('Idle')
}

function startTimer () {
  fsm.timerId = setTimeout(() => fsm.handle('Timeout'), 5000)
}

function clearTimer () {
  clearTimeout(fsm.timerId)
}

function buildFrame (data) {
  const buf = new Buffer(8 + data.length)
  buf.writeUInt16BE(data.length, 2)
  DLE_STX.copy(buf)
  data.copy(buf, 4)
  DLE_ETX.copy(buf, data.length + 4)
  const crcInt = crc.compute(buf.slice(2, data.length + 6))
  buf.writeUInt16LE(crcInt, data.length + 6)
  return buf
}

function prettyHex (buf) {
  const pairs = []
  for (let i = 0; i < buf.length; i++) {
    pairs.push((buf.slice(i, i + 1).toString('hex')))
  }

  return pairs.join(' ')
}

module.exports = fsm
