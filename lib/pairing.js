const fs = require('fs')
const crypto = require('crypto')
const got = require('got')
const baseX = require('base-x')
const querystring = require('querystring')

const E = require('./error')
const selfSign = require('./self_sign')

const PORT = 3000
const ALPHA_BASE = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:'

const bsAlpha = baseX(ALPHA_BASE)

const offsets = {
  caHash: 0,
  token: 32,
  hostname: 64
}

// [caHash, token, Buffer.from(hostname)]
function extractHostname (totem, oss) {
  return totem.slice(oss.hostname).toString()
}

function extractCaHash (totem, oss) {
  return totem.slice(oss.caHash, oss.token)
}

function extractToken (totem, oss) {
  return totem.slice(oss.token, oss.hostname).toString('hex')
}

function pair (totemStr, clientCert, connectionInfoPath, model, numOfCassettes, numOfStackers) {
  const totem = Buffer.from(bsAlpha.decode(totemStr))

  const hostname = extractHostname(totem, offsets)
  const expectedCaHash = extractCaHash(totem, offsets)
  const token = extractToken(totem, offsets)

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const initialOptions = {
    json: true,
    key: clientCert.key,
    cert: clientCert.cert,
    rejectUnauthorized: false
  }

  return got(`https://${hostname}:${PORT}/ca?token=${tokenHash}`, initialOptions)
    .then(r => {
      const ca = r.body.ca
      const caHash = crypto.createHash('sha256').update(ca).digest()

      if (!caHash.equals(expectedCaHash)) throw new E.CaHashError()

      const options = {
        key: clientCert.key,
        cert: clientCert.cert,
        ca
      }

      const query = querystring.stringify({token, model, numOfCassettes, numOfStackers})
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
