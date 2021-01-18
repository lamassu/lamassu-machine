const _ = require('lodash/fp')
const bitcoin = require('bitcoinjs-lib')
const base58Validator = require('./validators').base58Validator
const bech32Validator = require('./validators').bech32Validator

const base58Opts = {
  bufferLength: 21,
  mainNetPrefix: [ [0x00], [0x05] ],
  testNetPrefix: [ [0x6f], [0xc4] ]
}

const bech32Opts = {
  mainNetPrefix: 'bc',
  testNetPrefix: 'tb'
}

module.exports = {depositUrl, parseUrl, formatAddress, base58Opts, bech32Opts, createWallet}

function parseUrl (network, url) {
  const res = /^(bitcoin:)?(\w+)/i.exec(url)
  const address = res && res[2]

  console.log('DEBUG16: [%s] *%s*', network, address)

  if (!validate(network, address)) throw new Error('Invalid address')

  return address
}

function depositUrl (address, amount) {
  const parts = _.split(':', address)

  // Strike LN payment
  if (parts[0] === 'strike') return _.nth(3, parts)

  // Regular LN payment
  if (_.size(parts) === 2) return _.nth(1, parts)

  return `bitcoin:${address}?amount=${amount}`
}

function formatAddress (address) {
  const parts = _.split(':', address)
  const isLightning = _.size(parts) >= 2

  if (isLightning) return 'Lightning Network'
  return address
}

function validate (network, address) {
  if (!network) throw new Error('No network supplied.')
  if (!address) throw new Error('No address supplied.')
  if (base58Validator(network, address, base58Opts)) return true
  if (bech32Validator(network, address, bech32Opts)) return true
  return false
}

function createWallet () {
  const keyPair = bitcoin.ECPair.makeRandom()
  const segwitAddr = bitcoin.payments.p2wpkh({ pubkey: keyPair.publicKey })

  return {
    publicAddress: segwitAddr.address,
    privateKey: keyPair.toWIF()
  }
}
