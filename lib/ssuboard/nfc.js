const EventEmitter = require('events')

const Pcsc = require('pcsclite')

const pcsc = Pcsc()

const emitter = new EventEmitter()

let reader = null
let protocol = null

module.exports = {emitter, run, transmit}

function transmitOnce (buf, responseSize, currentBuf) {
  return new Promise((resolve, reject) => {
    reader.transmit(buf, responseSize, protocol, (err, data) => {
      if (err) return reject(err)
      resolve(data)
    })
  })
  .then(r => {
    const sw = r.slice(-2)
    const responseBuf = r.slice(0, -2)
    const newCurrentBuf = Buffer.concat([currentBuf, responseBuf])

    if (sw[0] === 0x61) {
      return transmitOnce(Buffer.from([0x00, 0xC0, 0x00, 0x00, sw[1]]), responseSize, newCurrentBuf)
    }

    if (sw[0] !== 0x90 || sw[1] !== 0x00) throw new Error('Error: ' + sw.toString('hex'))
    return newCurrentBuf
  })
}

function transmit (buf, responseSize) {
  return transmitOnce(buf, responseSize, Buffer.alloc(0))
}

function run () {
  pcsc.on('reader', function (_reader) {
    reader = _reader
    reader.on('error', console.log)
    reader.on('status', function (status) {
      const changes = this.state ^ status.state

      if (changes) {
        if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
          reader.disconnect(reader.SCARD_LEAVE_CARD, function (err) {
            protocol = null
            if (err) console.log(err)
            emitter.emit('cardRemoved')
          })
        } else if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
          reader.connect({share_mode: this.SCARD_SHARE_EXCLUSIVE}, function (err, _protocol) {
            if (err) return console.log(err)
            protocol = _protocol

            emitter.emit('cardPresent')
          })
        }
      }
    })
  })

  pcsc.on('error', err => {
    console.log('PCSC error', err.message)
  })
}
