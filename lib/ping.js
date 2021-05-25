const _ = require('lodash/fp')
const NetworkSpeed = require('network-speed')
const ping = require('ping')

const testConnection = new NetworkSpeed()

const MEGABYTE = 1000000

const REPOSITORIES_URL = [
  `us.archive.ubuntu.com`,
  `uk.archive.ubuntu.com`,
  `za.archive.ubuntu.com`,
  `cn.archive.ubuntu.com`
]

const getFileUrls = size => ([
  `https://eu.httpbin.org/stream-bytes/${size}`,
  `https://httpbin.org/stream-bytes/${size}`
])

const pingRepository = () => {
  const promises = _.map(repo => {
    return ping.promise.probe(repo)
      .then(res => ({
        url: repo,
        isAlive: res.alive
      }))
  }, REPOSITORIES_URL)

  return Promise.all(promises)
}

const checkDownloadSpeed = (size = 50) => {
  const bytes = size * MEGABYTE
  const URLs = getFileUrls(bytes)
  const promises = _.map(url => {
    return testConnection.checkDownloadSpeed(url, bytes)
      .then(speed => ({ url, 'MB/s': speed.mbps * 0.125 }))
  }, URLs)

  return Promise.all(promises)
}

module.exports = { pingRepository, checkDownloadSpeed }
