const fs = require('fs')
const crypto = require('crypto')
const got = require('got')
const E = require('./error')
const selfSign = require('./self_sign')

const PORT = 3000

// [caHash, token, Buffer.from(hostname)]
function extractHostname (totem) {
  return totem.slice(64).toString()
}

function pair (totemStr, clientCert, connectionInfoPath) {
  const totem = Buffer.from(totemStr, 'base64')
  const hostname = extractHostname(totem)
  const expectedCaHash = totem.slice(0, 32)
  const token = totem.slice(32, 64).toString('hex')
  const hexToken = token.toString('hex')
  const caHexToken = crypto.createHash('sha256').update(hexToken).digest('hex')

  const initialOptions = {
    json: true,
    key: clientCert.key,
    cert: clientCert.cert,
    rejectUnauthorized: false
  }

  return got(`https://${hostname}:${PORT}/ca?token=${caHexToken}`, initialOptions)
  .then(r => {
    console.log('DEBUG498')
    const ca = r.body.ca
    const caHash = crypto.createHash('sha256').update(ca).digest()

    console.log(ca)
    console.log('DEBUG499')

    if (!caHash.equals(expectedCaHash)) throw new E.CaHashError()

    const options = {
      key: clientCert.key,
      cert: clientCert.cert,
      ca
    }

    console.log('DEBUG500')
    return got.post(`https://${hostname}:${PORT}/pair?token=${hexToken}`, options)
    .then(() => {
      console.log('DEBUG501')
      const connectionInfo = {
        host: hostname,
        ca
      }

      fs.writeFileSync(connectionInfoPath, JSON.stringify(connectionInfo))
    })
  })
}

function unpair (connectionInfoPath) {
  fs.unlinkSync(connectionInfoPath)
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
    fs.writeFileSync(certPath, JSON.stringify(cert))
    return cert
  })
}

function getCert (certPath) {
  try {
    return JSON.parse(fs.readFileSync(certPath))
  } catch (e) {
    return null
  }
}

module.exports = {init, pair, unpair, connectionInfo, getCert}
