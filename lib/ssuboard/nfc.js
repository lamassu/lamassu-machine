const actionEmitter = require('../action-emitter')

const Pcsc = require('pcsclite')

let reader = null
let protocol = null

module.exports = {run, transmit, control}

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
}

function transmit (buf, responseSize) {
  if (!reader) return
  return transmitOnce(buf, responseSize, Buffer.alloc(0))
}

function control (code, buf, responseSize) {
  console.log('DEBUG200')
  if (!reader) return
  console.log('DEBUG201')

  return new Promise((resolve, reject) => {
    console.log('DEBUG202')
    console.log(reader)
    reader.connect({share_mode: this.SCARD_SHARE_EXCLUSIVE}, (err, _protocol) => {
      if (err) return reject(err)
      reader.control(buf, reader.SCARD_CTL_CODE(code), responseSize, (err, out) => {
        console.log('DEBUG203')
        if (err) return reject(err)
        console.log('DEBUG204')
        return resolve(out)
      })
    })
  })
}

function run () {
  const pcsc = Pcsc()
  pcsc.on('error', err => {
    console.log('PCSC error', err.message)
  })

  return new Promise((resolve, reject) => {
    console.log('DEBUG503')
    pcsc.on('reader', function (_reader) {
      console.log('DEBUG502')
      reader = _reader

      console.log(reader)
      resolve()

      reader.on('error', console.log)
      reader.on('status', function (status) {
        const changes = this.state ^ status.state

        console.log('DEBUG501')

        if (changes) {
          if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
            reader.disconnect(reader.SCARD_LEAVE_CARD, function (err) {
              protocol = null
              if (err) console.log(err)
              actionEmitter.emit('nfc', {action: 'cardRemoved'})
            })
          } else if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
            reader.connect({share_mode: this.SCARD_SHARE_EXCLUSIVE}, function (err, _protocol) {
              if (err) return console.log(err)
              protocol = _protocol

              console.log('DEBUG500')
              actionEmitter.emit('nfc', {action: 'cardPresent'})
            })
          }
        }
      })
    })
  })
}
