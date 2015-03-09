'use strict'

var forge = require('node-forge')
var pki = forge.pki

function _generateCertificate (keys, cb) {
  var cert = pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5)

  // self-sign certificate
  cert.sign(keys.privateKey, forge.md.sha256.create())

  // convert a Forge certificate to PEM
  var certPem = pki.certificateToPem(cert)
  var keyPem = pki.privateKeyToPem(keys.privateKey)

  cb(null, certPem, keyPem)
}

exports.generateCertificate = function generateCertificate (cb) {
  pki.rsa.generateKeyPair(3072, function (err, keys) {
    if (err) return cb(err)
    _generateCertificate(keys, cb)
  })
}
