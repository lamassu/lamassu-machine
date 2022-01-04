const _ = require('lodash/fp')
const ping = require('ping')
const http = require('http')
const https = require('https')
let { URL } = require('url')

const DOWNLOAD_SAMPLE_SIZE = 5

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
  const speedTest = (url, size) => {
    const getProtocol = url => (new URL(url)).protocol === 'http:' ? http : https
    let startTime
    let protocol = getProtocol(url)

    return new Promise((resolve, _) => {
      return protocol.get(url, response => {
        response.once('data', () => {
          startTime = process.hrtime()
        });

        response.once('end', () => {
          const endTime = process.hrtime(startTime)
          const duration = (endTime[0] * 1e9 + endTime[1]) / 1e9
          const bitsLoaded = size * 8
          const bps = (bitsLoaded / duration).toFixed(2)
          const kbps = (bps / 1000).toFixed(2)
          const mbps = (kbps / 1000).toFixed(2)
          resolve({ bps, kbps, mbps })
        })
      })
    }).catch(error => {
      throw new Error(error);
    })
  }

  const promises = _.map(elem => {
    const sample = []
    for (let i = 0; i < DOWNLOAD_SAMPLE_SIZE; i++) {
      sample.push(speedTest)
    }

    const resolveSampleSeq = funcs =>
      funcs.reduce((promise, func) =>
        promise.then(result => func(elem.url, elem.size).then(Array.prototype.concat.bind(result))), Promise.resolve([]))
    
    return resolveSampleSeq(sample)
      .then(res => {
        const speeds = _.map(it => it.mbps * 0.125, res)
        const sortedAscSpeeds = speeds.sort()

        // Calculate mean after removing top and bottom speed which are possible outliers
        const meanSpeed = _.mean(sortedAscSpeeds.slice(1, -1)).toFixed(4)
        return { url: elem.url, speed: meanSpeed }
      })
  }, packages)

  return Promise.all(promises)
}

module.exports = { pingRepository, checkDownloadSpeed }
