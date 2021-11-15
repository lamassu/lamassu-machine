const _ = require('lodash/fp')
const NetworkSpeed = require('network-speed')
const ping = require('ping')

const testConnection = new NetworkSpeed()

const pingRepository = (urls) => {
  const promises = _.map(repo => {
    return ping.promise.probe(repo)
      .then(res => ({
        url: repo,
        isAlive: res.alive,
        averageResponseTime: res.avg,
        packetLoss: res.packetLoss
      }))
  }, urls)

  return Promise.all(promises)
}

const checkDownloadSpeed = (packages) => {
  const promises = _.map(elem => {
    return testConnection.checkDownloadSpeed(elem.url, elem.size)
      .then(speed => ({ url: elem.url, speed: speed.mbps * 0.125 }))
  }, packages)

  return Promise.all(promises)
}

module.exports = { pingRepository, checkDownloadSpeed }
