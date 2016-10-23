const fs = require('fs')
const crypto = require('crypto')
const got = require('got')
const E = require('./error')
const selfSign = require('./self_sign')

const PORT = 3000

function extractIp (totem) {
  const ips = []

  for (let segment of totem.slice(0, 4)) {
    ips.push(segment.toString())
  }

  const ip = ips.join('.')
  return ip
}

function pair (totem, clientCert, connectionInfoPath) {
  const ip = extractIp(totem)
  const expectedCaHash = totem.slice(4, 36)
  const token = totem.slice(36, 58).toString('hex')
  const hexToken = token.toString('hex')
  const caHexToken = crypto.createHash('sha256').update(hexToken).digest('hex')

  const initialOptions = {
    json: true,
    key: clientCert.key,
    cert: clientCert.cert,
    rejectUnauthorized: false
  }

  return got(`https://${ip}:${PORT}/ca?token=${caHexToken}`, initialOptions)
  .then(r => {
    const ca = r.body.ca
    const caHash = crypto.createHash('sha256').update(ca).digest()

    if (!caHash.equals(expectedCaHash)) throw new E.CaHashError()

    const options = {
      key: clientCert.key,
      cert: clientCert.cert,
      ca
    }

    return got.post(`https://${ip}:${PORT}/pair?token=${hexToken}`, options)
    .then(() => {
      const connectionInfo = {
        ip,
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

function hasCert (certPath) {
  return !!getCert(certPath)
}

function getCert (certPath) {
  try {
    return JSON.parse(fs.readFileSync(certPath))
  } catch (e) {
    return null
  }
}

module.exports = {init, pair, unpair, connectionInfo, hasCert, getCert}
