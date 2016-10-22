const fs = require('fs')
const crypto = require('crypto')
const got = require('got')
const E = require('./error')
const selfSign = require('./self_sign')

function extractIp (totem) {
  const ips = []

  for (let segment of totem.slice(0, 4)) {
    ips.push(segment.toString())
  }

  const ip = ips.join('.')
  return ip
}

function pair (totem, clientKey, clientCert, connectionInfoPath) {
  const ip = extractIp(totem)
  const expectedCaHash = totem.slice(4, 36)
  const token = totem.slice(36, 58).toString('hex')
  const hexToken = token.toString('hex')
  const caHexToken = crypto.createHash('sha256').update(hexToken).digest('hex')

  const initialOptions = {
    json: true,
    key: clientKey,
    cert: clientCert,
    rejectUnauthorized: false
  }

  return got(`https://${ip}:3000/ca?token=${caHexToken}`, initialOptions)
  .then(r => {
    const ca = r.body.ca
    const caHash = crypto.createHash('sha256').update(ca).digest()

    if (!caHash.equals(expectedCaHash)) throw new E.CaHashError()

    const options = {
      key: clientKey,
      cert: clientCert,
      ca
    }

    return got.post(`https://${ip}:3000/pair?token=${hexToken}`, options)
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

function isPaired (connectionInfoPath) {
  return fs.existsSync(connectionInfoPath)
}

function connectionInfo (connectionInfoPath) {
  try {
    return JSON.parse(fs.readFileSync(connectionInfoPath))
  } catch (e) {
    return null
  }
}

function init (certPath) {
  return selfSign()
  .then(cert => fs.writeFileSync(certPath, JSON.stringify(cert)))
}

function hasCert (certPath) {
  return fs.existsSync(certPath)
}

module.exports = {init, pair, unpair, isPaired}
