const fs = require('fs')
const path = require('path')
const _ = require('lodash/fp')

const SOFTWARE_CONFIG_PATH = path.resolve(__dirname, '../../software_config.json')
const DEVICE_CONFIG_PATH = path.resolve(__dirname, '../../device_config.json')
const softwareConfig = JSON.parse(fs.readFileSync(SOFTWARE_CONFIG_PATH))
const deviceConfig = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH))
let config = _.merge(softwareConfig, deviceConfig)
config.updater.dataPath = config.brain.dataPath

const downloadDir = config.downloadDir
const packagePath = config.downloadDir + '/update.tar'

var NewUpdater = function (config) {
  this.config = config
  // this.extractor = require('./extractor').factory(this.config.extractor)
  this.downloading = false
  this.finished = null
}

NewUpdater.prototype._init = function _init () {
  if (fs.existsSync(downloadDir)) {
    if (fs.existsSync(packagePath)) fs.unlinkSync(packagePath)
  } else {
    fs.mkdirSync(downloadDir)
  }
}

const downloadHandler = res => {
  try {
    var packagePath = this.config.downloadDir + '/update.tar'
    var fileOut = fs.createWriteStream(packagePath)
    res.pipe(fileOut)
    res.on('end', function () {
      if (res.complete) {
        console.log('IS COMPLETE!')
      } else {
        console.log('[WARN]: The update file we\'ve received is incomplete. ' +
                    'The connection was terminated before the whole content ' +
                    'was transmitted. The update will NOT continue.')
      }
    })
    res.on('error', () => console.log('ERROR'))
    var file = fs.createWriteStream('/tmp/node/test.gz')
    res.on('data', function (chunk) {
      file.write(chunk)
    }).on('end', function () {
      file.end()
    })
  } catch (err) {
    console.log(err)
  }
}

NewUpdater.prototype.handleUpdateRequest = function handleUpdateRequest (trader) {
  trader.machineUpdate({ updateAcceptance: true }, downloadHandler)
  this.downloading = true
}

NewUpdater.factory = config => new NewUpdater(config.updater)
const updater = NewUpdater.factory(config)

module.exports = updater
