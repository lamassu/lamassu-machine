const _ = require('lodash/fp')
const NetworkSpeed = require('network-speed')
const ping = require('ping')

const testConnection = new NetworkSpeed()

const REPOSITORIES_URL = [
  `us.archive.ubuntu.com`,
  `uk.archive.ubuntu.com`,
  `za.archive.ubuntu.com`,
  `cn.archive.ubuntu.com`
]

const PACKAGES = [
  {
    url: `https://deb.debian.org/debian/pool/main/p/python-defaults/python-defaults_2.7.18-3.tar.gz`,
    size: 8900
  }
]

const pingRepository = () => {
  const promises = _.map(repo => {
    return ping.promise.probe(repo)
      .then(res => ({
        url: repo,
        isAlive: res.alive,
        averageResponseTime: res.avg,
        packetLoss: res.packetLoss
      }))
  }, REPOSITORIES_URL)

  return Promise.all(promises)
}

const checkDownloadSpeed = () => {
  const promises = _.map(elem => {
    return testConnection.checkDownloadSpeed(elem.url, elem.size)
      .then(speed => ({ url: elem.url, speed: speed.mbps * 0.125 }))
  }, PACKAGES)

  return Promise.all(promises)
}

module.exports = { pingRepository, checkDownloadSpeed }
