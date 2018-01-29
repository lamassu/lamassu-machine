const u2f = require('u2f')

const nfc = require('./nfc')

const APP_ID = 'https://lamassu.is'

nfc.run()

nfc.emitter.on('cardPresent', register)

function delay (delta) {
  return new Promise(resolve => setTimeout(resolve, delta))
}

function register () {
  const registrationRequest = u2f.request(APP_ID)
  const cmd = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x40])
  const challenge = Buffer.from(registrationRequest.challenge, 'base64')
  const appId = Buffer.alloc(32)
  appId.write(registrationRequest.appId)
  // const buf = Buffer.concat([cmd, challenge, appId])
  // const buf = Buffer.from('00A404000bA000000397425446590201', 'hex')
  const buf = Buffer.from('00A4040009D15600013283260101', 'hex')
  // const buf = Buffer.from([0x0, 0x3, 0x0, 0x0, 0x0])

  const buf2 = Buffer.from('0001000040e89a8820c2c4e475f54f32b85fbc2d6fbd0e9a4ed7ede360381a6def1128ba63879b9ca2c6063910426129598e369a876dafcd417ae445f4d32148104a92219d', 'hex')
  // console.log(buf.length)
  // console.log(buf)

  return delay(1000)
  .then(() => nfc.transmit(buf2, 10000))
  .then(console.log)
}
