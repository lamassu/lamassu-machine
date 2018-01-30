const crypto = require('crypto')

const u2f = require('u2f')

const nfc = require('./nfc')

const APP_ID = 'https://lamassu.is'

nfc.run()

nfc.emitter.on('cardPresent', register)

function hash (s) {
  return crypto.createHash('SHA256').update(s).digest()
}

function delay (delta) {
  return new Promise(resolve => setTimeout(resolve, delta))
}

// request: {version, appId, challenge} - from user session, kept on server.
// registerData: {clientData, registrationData} - result of u2f.register

function checkRegistration (registrationRequest, clientData, response) {
  const registerData = {
    clientData,
    registrationData: response.toString('base64')
  }

  const result = u2f.checkRegistration(registrationRequest, registerData)
  console.log(result)
}

// function toWebsafeBase64 (buf) {
//   return buf.toString('base64').replace(/\//g,'_').replace(/\+/g,'-').replace(/=/g, '');
// }

function register () {
  console.log('card present')
  console.log(APP_ID)
  const registrationRequest = u2f.request(APP_ID)
  const cmd = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x40])
  const clientDataObj = {
    typ: 'navigator.id.finishEnrollment',
    challenge: registrationRequest.challenge,
    origin: APP_ID
  }

  console.log(clientDataObj)
  const clientDataStr = JSON.stringify(clientDataObj)
  const clientDataHash = hash(clientDataStr)
  const clientDataBase64 = Buffer.from(clientDataStr).toString('base64')
  const buf = Buffer.concat([cmd, clientDataHash, hash(APP_ID)])

  return delay(0)
  .then(() => nfc.transmit(buf, 10000))
  .then(r => checkRegistration(registrationRequest, clientDataBase64, r))
}
