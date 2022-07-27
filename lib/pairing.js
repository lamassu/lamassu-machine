const _ = require('lodash/fp')
const fs = require('fs')
const crypto = require('crypto')
const got = require('got')
const baseX = require('base-x')
const querystring = require('querystring')
const csexp = require('lamassu-csexp')

const E = require('./error')
const selfSign = require('./self_sign')

const PORT = 3000

const PAIRING_VERSION = "0"

const verifyField = (totem, field, pred) =>
  pred(_.get([field], totem)) ?
    Promise.resolve(totem) :
    Promise.reject(new Error("Reading pairing totem: validation of the field " + field + "failed"))

const readTotem = str => Promise.resolve(str)
  .then(csexp.fromCanonical)
  .then(csexp.lists.plistToObject)
  .then(totem =>
    Promise.all([
      verifyField(totem, 'version', _.isEqual(PAIRING_VERSION)),
      verifyField(totem, 'hostname', _.isString),
      verifyField(totem, 'caHash', _.isString),
      verifyField(totem, 'token', _.isString),
      verifyField(totem, 'identifier', _.isString),
    ])
    .then(() => totem)
  )

function pair (totem, clientCert, connectionInfoPath, model, numOfCassettes) {
  return readTotem(totem)
    .then(({ hostname, token, identifier, caHash: expectedCaHash }) => {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      const initialOptions = {
        json: true,
        key: clientCert.key,
        cert: clientCert.cert,
        rejectUnauthorized: false
      }

      return got(`https://${hostname}:${PORT}/ca?token=${tokenHash}&id=${identifier}`, initialOptions)
        .then(r => {
          const ca = r.body.ca
          const caHash = crypto.createHash('sha256').update(ca).digest('hex')

          if (caHash !== expectedCaHash) throw new E.CaHashError()

          const options = {
            key: clientCert.key,
            cert: clientCert.cert,
            ca
          }

          const query = querystring.stringify({ token, model, numOfCassettes, id: identifier })
          return got.post(`https://${hostname}:${PORT}/pair?${query}`, options)
            .then(() => {
              const connectionInfo = {
                host: hostname,
                ca
              }

              fs.writeFileSync(connectionInfoPath, JSON.stringify(connectionInfo))
            })
        })
        .catch(err => {
          console.log(err)
          throw new Error("Pairing error - Please make sure you have a stable network connection and that you are using the right QR Code")
        })
    })
}

function unpair (connectionInfoPath) {
  fs.unlinkSync(connectionInfoPath)
}

function isPaired (connectionInfoPath) {
  return !!connectionInfo(connectionInfoPath)
}

function connectionInfo (connectionInfoPath) {
  try {
    return JSON.parse(fs.readFileSync(connectionInfoPath))
  } catch (e) {
    return null
  }
}

function init (certPath) {
  return selfSign.generateCertificate()
    .then(cert => {
      fs.writeFileSync(certPath.key, cert.key)
      fs.writeFileSync(certPath.cert, cert.cert)
      return cert
    })
}

function getCert (certPath) {
  try {
    return {
      key: fs.readFileSync(certPath.key),
      cert: fs.readFileSync(certPath.cert)
    }
  } catch (e) {
    return null
  }
}

module.exports = {init, pair, unpair, isPaired, connectionInfo, getCert}
