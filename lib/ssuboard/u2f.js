const crypto = require('crypto')
const EventEmitter = require('events')

const u2f = require('u2f')
const pDoWhilst = require('p-do-whilst')
const nfc = require('./nfc')

const APP_ID = 'https://lamassu.is'

const emitter = new EventEmitter()

module.exports = {run, emitter, register, authenticate}

nfc.emitter.on('cardPresent', () => emitter.emit('cardPresent'))

function run () {
  nfc.run()
}

function hash (s) {
  return crypto.createHash('SHA256').update(s).digest()
}

function checkRegistration (registrationRequest, clientData, response) {
  const registerData = {
    clientData,
    registrationData: response.toString('base64')
  }

  const r = u2f.checkRegistration(registrationRequest, registerData)

  if (r.errorMessage) throw new Error(`Unsuccessful registration: ${r.errorMessage}`)

  if (r.successful) {
    // Note [josh]: In order to process larger handles,
    // we'd need to test with device than generates larger handles.
    // Implementation is easy: just support correct Lc values here:
    // https://en.wikipedia.org/wiki/Smart_card_application_protocol_data_unit
    // (in authentication code)/
    if (Buffer.from(r.keyHandle, 'base64').length > 255) throw new Error('Large key handles not supported')

    return r
  }

  throw new Error('Unsuccessful registration')
}

function checkSignature (authRequest, clientData, authResponse, publicKey) {
  const signResult = {
    clientData,
    signatureData: authResponse.toString('base64')
  }

  const r = u2f.checkSignature(authRequest, signResult, publicKey)

  if (r.errorMessage) throw new Error(`Unsuccessful authorization: ${r.errorMessage}`)
  if (r.successful && r.userPresent) return true
  throw new Error('Unsuccessful authorization')
}

function authenticate (authRecs) {
  let index = -1
  let success = false

  const action = () => {
    const authRec = authRecs[++index]
    if (!authRec) throw new Error('No match for U2F key')

    return singleAuthenticate(authRec, false)
    .then(r => { success = r })
  }

  const condition = () => !success

  return pDoWhilst(action, condition)
  .then(() => singleAuthenticate(authRecs[index], true))
  .then(r => {
    if (!r) throw new Error('User not present')
    return true
  })
}

function singleAuthenticate (authRec, verifyPresence) {
  const authRequest = u2f.request(APP_ID, authRec.keyHandle)

  const clientDataObj = {
    typ: 'navigator.id.getAssertion',
    challenge: authRequest.challenge,
    origin: authRequest.appId
  }

  const verifyPresenceByte = verifyPresence ? 0x03 : 0x07
  const clientDataStr = JSON.stringify(clientDataObj)
  const clientDataHash = hash(clientDataStr)
  const clientDataBase64 = Buffer.from(clientDataStr).toString('base64')
  const keyHandle = Buffer.from(authRequest.keyHandle, 'base64')
  const keyHandleSize = keyHandle.length

  if (keyHandleSize > 255) throw new Error('Large key handle sizes not supported')

  const keyHandleSizeBuf = Buffer.from([keyHandleSize])
  const appIdHash = hash(authRequest.appId)
  const dataSize = 65 + keyHandleSize
  const cmd = Buffer.from([0x00, 0x02, verifyPresenceByte, 0x00, dataSize])
  const bufs = [cmd, clientDataHash, appIdHash, keyHandleSizeBuf, keyHandle]
  const requestBuf = Buffer.concat(bufs)

  return nfc.transmit(requestBuf, 10000)
  .then(r => {
    if (verifyPresence) return checkSignature(authRequest, clientDataBase64, r, authRec.publicKey)
    throw new Error('U2F protocol error')
  })
  .catch(err => {
    if (verifyPresence) throw err
    if (err.codes[0] === 0x69 && err.codes[1] === 0x85) return true
    if (err.codes[0] === 0x6a && err.codes[1] === 0x80) return false
    throw err
  })
}

function register () {
  const registrationRequest = u2f.request(APP_ID)
  const cmd = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x40])

  const clientDataObj = {
    typ: 'navigator.id.finishEnrollment',
    challenge: registrationRequest.challenge,
    origin: APP_ID
  }

  const clientDataStr = JSON.stringify(clientDataObj)
  const clientDataHash = hash(clientDataStr)
  const clientDataBase64 = Buffer.from(clientDataStr).toString('base64')
  const buf = Buffer.concat([cmd, clientDataHash, hash(APP_ID)])

  return nfc.transmit(buf, 10000)
  .then(r => checkRegistration(registrationRequest, clientDataBase64, r))
}

run()
emitter.on('cardPresent', () => {
  console.log('card present')
  const authRecs = [{
    publicKey: 'BP-Let6PdVxRDM-uNkvXQ7hxQNJKtxgabu_4O_ooTeSc-vQ9ELQwx5wyyxkayxkJ2pIB1ORE8dQlbzMmKwgEDf4',
    keyHandle: 'aJ-mzWGp8AkRd9uDX4Tk8x6YcFQFgJb4YK2CxQ2c-8al7PzuT9F1OTCpQ59SF_1d8ZT33V9WT-xSsRWmLzUPFk-WKbI_IANX0YC-xi52zgc'
  }, {
    publicKey: 'BP-Let6PdVxRDM-uNkvXQ7hxQNJKtxgabu_4O_ooTeSc-vQ9ELQwx5wyyxkayxkJ2pIB1ORE8dQlbzMmKwgEDf4',
    keyHandle: 'vJ-mzWGp8AkRd9uDX4Tk8x6YcFQFgJb4YK2CxQ2c-8al7PzuT9F1OTCpQ59SF_1d8ZT33V9WT-xSsRWmLzUPFk-WKbI_IANX0YC-xi52zgc'
  }]

  authenticate(authRecs)
  .then(console.log)
  .catch(console.log)
})
