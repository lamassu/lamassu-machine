const forge = require('node-forge')
const pki = forge.pki
const opensslKeyGen = require('./openssl-keygen')

function buildCertificate (keys) {
  var cert = pki.createCertificate()
  cert.publicKey = keys.publicKey
  cert.serialNumber = '01'
  cert.validity.notBefore = new Date()
  cert.validity.notAfter = new Date()
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 100)

  // self-sign certificate
  cert.sign(keys.privateKey, forge.md.sha256.create())

  // convert a Forge certificate to PEM
  var certPem = pki.certificateToPem(cert)
  var keyPem = pki.privateKeyToPem(keys.privateKey)

  return {cert: certPem, key: keyPem}
}

function generateKeys () {
  return opensslKeyGen.generateKeyPair()
    .then(r => ({
      privateKey: pki.privateKeyFromPem(r.privateKey),
      publicKey: pki.publicKeyFromPem(r.publicKey)
    }))
    .catch(e => {
      console.log('openssl not present, using forge')
      return new Promise((resolve, reject) => {
        pki.rsa.generateKeyPair(3072, (err, keys) => {
          if (err) return reject(err)
          return resolve(keys)
        })
      })
    })
}

exports.generateCertificate = function generateCertificate () {
  return generateKeys()
    .then(keys => buildCertificate(keys))
}
