const _ = require('lodash/fp')

const actionEmitter = require('../action-emitter')

const Pcsc = require('pcsclite')

let reader = null
let protocol = null

module.exports = {run, transmit, control, cancel}

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

      if (sw[0] !== 0x90 || sw[1] !== 0x00) {
        const err = new Error('Error: ' + sw.toString('hex'))
        err.codes = sw
        throw err
      }

      return newCurrentBuf
    })
    .catch(err => {
      console.log(buf.toString('hex'))
      console.log(err)
      throw err
    })
}

function transmit (buf, responseSize) {
  if (!reader) return
  return transmitOnce(buf, responseSize, Buffer.alloc(0))
}

function cancel () {
  if (!reader) return
  return reader.close()
}

function control (code, buf, responseSize) {
  if (!reader) return

  return new Promise((resolve, reject) => {
    reader.connect({share_mode: this.SCARD_SHARE_EXCLUSIVE}, (err, _protocol) => {
      if (err) return reject(err)
      reader.control(buf, reader.SCARD_CTL_CODE(code), responseSize, (err, out) => {
        if (err) return reject(err)
        return resolve(out)
      })
    })
  })
}

function run (readerName) {
  const pcsc = Pcsc()
  pcsc.on('error', err => {
    console.log('PCSC error', err.message)
  })

  return new Promise((resolve, reject) => {
    pcsc.on('reader', function (_reader) {
      if (_reader.name !== readerName) return
      reader = _reader
      resolve()

      _reader.on('error', err => console.log(`Reader error: ${err.message}`))
      _reader.on('status', function (status) {
        const state = _.isNil(this.state) ? 0x00 : this.state
        const changes = state ^ status.state

        if (changes) {
          if ((changes & _reader.SCARD_STATE_EMPTY) && (status.state & _reader.SCARD_STATE_EMPTY)) {
            _reader.disconnect(_reader.SCARD_LEAVE_CARD, function (err) {
              protocol = null
              if (err) return console.log(`[leave] ${err}`)
              actionEmitter.emit('nfc', {action: 'cardRemoved'})
            })
          } else if ((changes & _reader.SCARD_STATE_PRESENT) && (status.state & _reader.SCARD_STATE_PRESENT)) {
            _reader.connect({share_mode: _reader.SCARD_SHARE_EXCLUSIVE}, function (err, _protocol) {
              if (err) console.log(`[present] ${err}`)
              protocol = _protocol
              const atr = status.atr
              actionEmitter.emit('nfc', {action: 'cardPresent', atr})
            })
          }
        }
      })
    })
  })
}
