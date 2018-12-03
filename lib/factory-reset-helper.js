const fs = require('fs')
const path = require('path')
const pify = require('pify')
const rimraf = pify(require('rimraf'))

const supervisorLogs = '/var/log/supervisor/lamassu*'

function backupClientSamples (dataPath) {
  let key = null
  let pem = null
  const keyPath = path.resolve(dataPath, 'client.sample.key')
  const pemPath = path.resolve(dataPath, 'client.sample.pem')

  if (fs.existsSync(keyPath)) {
    key = fs.readFileSync(keyPath)
  }

  if (fs.existsSync(pemPath)) {
    pem = fs.readFileSync(pemPath)
  }

  return {
    key: {
      value: key,
      path: keyPath
    },
    pem: {
      value: pem,
      path: pemPath
    }
  }
}

function restoreClientSamples ({ key, pem }) {
  if (key.value) {
    fs.appendFileSync(key.path, key.value)
  }
  if (pem.value) {
    fs.appendFileSync(pem.path, pem.value)
  }
}

function nuke (dataPath) {
  const samplesBkp = backupClientSamples(dataPath)

  const promises = [rimraf(supervisorLogs), rimraf(dataPath)]

  return Promise.all(promises).then(() => {
    fs.mkdirSync(dataPath)
    fs.mkdirSync(path.resolve(dataPath, 'log'))
    fs.mkdirSync(path.resolve(dataPath, 'tx-db'))
    restoreClientSamples(samplesBkp)
  })
}

module.exports = { nuke }
