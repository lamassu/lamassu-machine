// WARNING: Mifare is an insecure protocol. This is only for use in test devices. We're not even attempting to use
// the broken authentication.

const nfc = require('./nfc')

module.exports = {getData}

function getData () {
  const packet = Buffer.from('ffca000000', 'hex')

  return nfc.transmit(packet, 12)
    .then(console.log)
}
