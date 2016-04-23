'use strict'

var BigNumber = require('bignumber.js')
var _ = require('lodash')

exports.reset = function reset () {}
exports.configure = function configure () {}
exports.hasConfig = function hasConfig () { return true }

var phoneTx = null

exports.phoneCode = function phoneCode (number, cb) {
  cb(null, {
    code: '123456'
  })
}

exports.registerTx = function registerTx (tx, cb) {
  var _tx = _.cloneDeep(tx)
  _tx.satoshis = tx.cryptoAtoms.truncated().toNumber()
  delete _tx.cryptoAtoms
  delete _tx.cryptoCode
  console.log('DEBUG5')
  console.log(_tx)
  phoneTx = _tx
  setTimeout(cb, 2000)
}

exports.fetchPhoneTx = function fetchPhoneTx (number, cb) {
  phoneTx.cryptoAtoms = new BigNumber(phoneTx.satoshis)
  phoneTx.cryptoCode = 'BTC'
  cb(null, {tx: phoneTx})
}

exports.updatePhone = function updatePhone (number, cb) {
  cb()
}

exports.waitForDispense = function waitForDispense (status, cb) {
  setTimeout(function () {
    cb(null, {tx: {status: 'authorized'}})
  }, 5000)
}

exports.dispense = function dispense (_sessionId, cb) {
  cb()
}
