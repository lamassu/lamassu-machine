'use strict'

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
  console.log(tx)
  phoneTx = tx
  cb()
}

exports.fetchPhoneTx = function fetchPhoneTx (number, cb) {
  cb(null, {tx: phoneTx})
}

exports.updatePhone = function updatePhone (number, cb) {
  cb()
}

exports.waitForDispense = function waitForDispense (status, cb) {
  cb(null, {tx: {status: 'authorized'}})
}

exports.dispense = function dispense (_sessionId, cb) {
  cb()
}
