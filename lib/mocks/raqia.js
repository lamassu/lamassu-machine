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
  setTimeout(cb, 2000)
}

exports.fetchPhoneTx = function fetchPhoneTx (number, cb) {
  cb(null, {tx: phoneTx})
}

exports.updatePhone = function updatePhone (number, cb) {
  cb()
}

exports.waitForDispense = function waitForDispense (status, cb) {
  setTimeout(function () {
    cb(null, {tx: {status: 'authorized'}})
  }, 2000)
}

exports.dispense = function dispense (_sessionId, cb) {
  cb()
}
