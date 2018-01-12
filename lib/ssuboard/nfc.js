const EventEmitter = require('events')

const Pcsc = require('pcsclite')

const pcsc = Pcsc()

const emitter = new EventEmitter()

module.exports = {emitter, run}

function run () {
  pcsc.on('reader', function (reader) {
    reader.on('error', err => {
      console.log('Error(', this.name, '):', err.message)
    })

    reader.on('status', function (status) {
      console.log('Status(', this.name, '):', status)

      /* check what has changed */
      var changes = this.state ^ status.state

      if (changes) {
        if ((changes & this.SCARD_STATE_EMPTY) && (status.state & this.SCARD_STATE_EMPTY)) {
          console.log('card removed')

          reader.disconnect(reader.SCARD_LEAVE_CARD, function (err) {
            if (err) {
              console.log(err)
            } else {
              console.log('Disconnected')
            }
          })
        } else if ((changes & this.SCARD_STATE_PRESENT) && (status.state & this.SCARD_STATE_PRESENT)) {
          console.log('card inserted')

          reader.connect({share_mode: this.SCARD_SHARE_SHARED}, function (err, protocol) {
            if (err) {
              console.log(err)
            } else {
              console.log('Protocol(', reader.name, '):', protocol)
              reader.transmit(new Buffer([0x00, 0xB0, 0x00, 0x00, 0x20]), 40, protocol, function (err, data) {
                if (err) {
                  console.log(err)
                } else {
                  console.log('Data received', data)
                  emitter.emit('cardPresent')
                }
              })
            }
          })
        }
      }
    })

    reader.on('end', function () {
      console.log('Reader', this.name, 'removed')
    })
  })

  pcsc.on('error', function (err) {
    console.log('PCSC error', err.message)
  })
}
