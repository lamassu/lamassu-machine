const crypto = require('crypto')
const path = require('path')
const fs = require('fs')

const u2f = require('u2f')
const pDoWhilst = require('p-do-whilst')
const pify = require('pify')
const _ = require('lodash/fp')

const dataPath = require('../data-path')

const nfc = require('./nfc')
const APP_ID = 'https://lamassu.is'
const INITIAL_NAME = 'default'

const writeFile = pify(fs.writeFile)
const readFile = pify(fs.readFile)
const u2fPath = path.resolve(dataPath, 'u2f.json')

let u2fAuth = null

module.exports = { run, cardPresent, register, unregister, list, cancelScan }

function cardPresent () {
  if (_.isNil(u2fAuth) || _.isEmpty(u2fAuth)) {
    return register()
      .then(r => ({action: 'registered', record: r}))
  }

  return authenticate(_.values(u2fAuth))
    .then(r => ({action: 'authorized', record: r}))
    .catch(error => ({action: 'unauthorized', error: error.message}))
}

function run () {
  return loadAuth()
}

function loadAuth () {
  return readFile(u2fPath)
    .then(migrateFromSingleFobAndLoad)
    .then(r => {
      u2fAuth = r
      return u2fAuth
    })
    .catch(err => {
      if (err.code === 'ENOENT') return
      console.log(err)
    })
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

  console.log('DEBUG600')
  return nfc.transmit(requestBuf, 800)
    .then(r => {
      if (verifyPresence) return checkSignature(authRequest, clientDataBase64, r, authRec.publicKey)
      throw new Error('U2F protocol error')
    })
    .catch(err => {
      if (verifyPresence) throw err
      if (_.isNil(err.codes)) throw err
      if (err.codes[0] === 0x69 && err.codes[1] === 0x85) return true
      if (err.codes[0] === 0x6a && err.codes[1] === 0x80) return false
      throw err
    })
}

function register (name = INITIAL_NAME) {
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

  return nfc.transmit(buf, 800)
    .then(r => checkRegistration(registrationRequest, clientDataBase64, r))
    .then(r => {
      const current = u2fAuth || {}
      if (current[name]) throw new Error(`There's already a FOB named: ${name}`)
      writeFile(u2fPath, JSON.stringify(_.assign({ [name]: r }, current)))
    })
    .then(loadAuth)
}

function unregister (name) {
  if (!u2fAuth) return Promise.reject(new Error('Nothing to unregister'))
  if (!u2fAuth[name]) return Promise.reject(new Error(`No FOB registered with the name: ${name}`))

  return writeFile(u2fPath, JSON.stringify(_.unset(name, u2fAuth)))
    .then(loadAuth)
}

function list () {
  return _.keys(u2fAuth)
}

function cancelScan () {
  nfc.cancel()
}

function migrateFromSingleFobAndLoad (it) {
  if (!it) return

  const json = JSON.parse(it)
  if (_.isString(json.keyHandle)) {
    const newJson = {[INITIAL_NAME]: json}
    return writeFile(u2fPath, JSON.stringify(newJson))
      .then(() => newJson)
  }

  return json
}
