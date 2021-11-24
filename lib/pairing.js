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

// [caHash, token, Buffer.from(hostname)]
function extractHostname (totem) {
  return totem.slice(64 + 16).toString()
}

function pair (totemStr, clientCert, connectionInfoPath, model, numOfCassettes) {
  const totem = Buffer.from(bsAlpha.decode(totemStr))
  const hostname = extractHostname(totem)
  const expectedCaHash = totem.slice(0, 32)
  const token = totem.slice(32, 64 + 16).toString('hex')
  const identifier = totem.slice(64, 64 + 16).toString('hex')
  const hexToken = token.toString('hex')
  const caHexToken = crypto.createHash('sha256').update(hexToken).digest('hex')

  const initialOptions = {
    json: true,
    key: clientCert.key,
    cert: clientCert.cert,
    rejectUnauthorized: false
  }

  return got(`https://${hostname}:${PORT}/ca?token=${caHexToken}&id=${identifier}`, initialOptions)
    .then(r => {
      const ca = r.body.ca
      const caHash = crypto.createHash('sha256').update(ca).digest()

      if (!caHash.equals(expectedCaHash)) throw new E.CaHashError()

      const options = {
        key: clientCert.key,
        cert: clientCert.cert,
        ca
      }

      const query = querystring.stringify({token: hexToken, model, numOfCassettes})
      return got.post(`https://${hostname}:${PORT}/pair?${query}&id=${identifier}`, options)
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
