const EventEmitter = require('events')

const Pcsc = require('pcsclite')

const pcsc = Pcsc()

const emitter = new EventEmitter()

let reader = null
let protocol = null

module.exports = {emitter, run, transmit}

function transmit (buf, responseSize) {
  return new Promise((resolve, reject) => {
    reader.transmit(buf, responseSize, protocol, (err, data) => {
      if (err) return reject(err)
      resolve(data)
    })
  })
}

function run () {
  pcsc.on('reader', _reader => {
    reader = _reader
    reader.on('error', console.log)

    reader.on('status', function (status) {
      const changes = this.state ^ status.state

      if (changes) {
        if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
          reader.disconnect(reader.SCARD_LEAVE_CARD, err => {
            protocol = null
            if (err) console.log(err)
            emitter.emit('cardRemoved')
          })
        } else if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
          reader.connect({share_mode: this.SCARD_SHARE_SHARED}, (err, _protocol) => {
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

run()
