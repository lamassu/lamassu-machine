const _ = require('lodash/fp')

const actionEmitter = require('../action-emitter')

const nfc = require('./nfc')
const u2f = require('./u2f')

const deviceConfig = require('../../device_config.json')

const ATRS = [
  {
    name: 'feitian',
    type: 'u2f',
    atr: Buffer.from('3b8980014a434f5032343252334b', 'hex')
  },
  {
    name: 'feitian2',
    type: 'u2f',
    atr: Buffer.from('3b80800101', 'hex')
  },
  {
    name: 'yubikey',
    type: 'u2f',
    atr: Buffer.from('3b8c8001597562696b65794e454f723358', 'hex')
  },
  {
    name: 'china-mifare-1',
    type: 'mifare',
    atr: Buffer.from('3b8f8001804f0ca000000306030001000000006a', 'hex')
  }
]

module.exports = {run}

function determineFobType (atr) {
  const matchedFob = _.find(r => atr.equals(r.atr), ATRS)

  if (!matchedFob) return null

  return matchedFob.type
}

function processFob (atr) {
  const fobType = determineFobType(atr)

  switch (fobType) {
    case 'u2f':
      return u2f.cardPresent()
    default:
      return Promise.reject(new Error('Unsupported fob'))
  }
}

function cardPresent (atr) {
  actionEmitter.emit('fob', {action: 'fobPresent'})
  return processFob(atr)
    .then(rec => actionEmitter.emit('fob', rec))
}

function processNfc (event) {
  switch (event.action) {
    case 'cardPresent':
      return cardPresent(event.atr)
        .catch(_.noop)
    case 'cardRemoved':
      return actionEmitter.emit('fob', {action: 'fobRemoved'})
  }
}

function run () {
  const nfcReader = deviceConfig.brain.nfcReader
  if (!nfcReader) return
  return nfc.run(nfcReader)
    .then(u2f.run)
    .then(() => actionEmitter.on('nfc', processNfc))
}
