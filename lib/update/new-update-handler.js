const fs = require('fs')
const path = require('path')
const _ = require('lodash/fp')
const tar = require('tar')

const SOFTWARE_CONFIG_PATH = path.resolve(__dirname, '../../software_config.json')
const DEVICE_CONFIG_PATH = path.resolve(__dirname, '../../device_config.sample.json')
const softwareConfig = JSON.parse(fs.readFileSync(SOFTWARE_CONFIG_PATH))
const deviceConfig = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH))
let config = _.merge(softwareConfig, deviceConfig)
config.updater.dataPath = config.brain.dataPath

var NewUpdater = function (config) {
  this.config = config
  this.downloadDir = config.updater.downloadDir
  this.extractDir = config.updater.extractDir
  this.packagePath = null
  this.extractPath = null
  this.downloaded = false
  this.finished = false
}

NewUpdater.prototype._init = function _init ({ name }) {
  console.log('Preparing folders...')
  this.packagePath = this.downloadDir + name
  this.extractPath = this.extractDir + name
  if (fs.existsSync(this.downloadDir)) {
    if (fs.existsSync(this.packagePath)) fs.unlinkSync(this.packagePath)
  } else {
    fs.mkdirSync(this.downloadDir)
  }
}

NewUpdater.prototype._extract = function _extract () {
  if (fs.existsSync(this.extractDir)) {
    if (fs.existsSync(this.extractPath)) fs.unlinkSync(this.extractPath)
  } else {
    fs.mkdirSync(this.extractDir)
  }
  var fileIn = fs.createReadStream(this.packagePath)
  fileIn.pipe(tar.Extract({ path: this.extractPath }))
    .on('error', () => { throw Error('Error while extracting the update package!') })
}

NewUpdater.prototype.downloadHandler = function (downloadStream, options) {
  console.log('Starting package download...')
  const fileWriterStream = fs.createWriteStream(options.packagePath)
  downloadStream.pipe(fileWriterStream)

  downloadStream
    .on('error', (error) => {
      console.error(`Download failed: ${error.message}`)
      console.log('[WARN]: The update file we\'ve received is incomplete. ' +
                  'The connection was terminated before the whole content ' +
                  'was transmitted. The update will NOT continue.')
    })

  fileWriterStream
    .on('error', (error) => {
      console.error(`Could not write package to system: ${error.message}`)
    })
    .on('finish', () => {
      this.downloaded = true
      console.log(`Package downloaded to ${options.packagePath}`)
    })
}

NewUpdater.prototype.handleUpdateRequest = function handleUpdateRequest (trader) {
  const packageName = { name: '/update.tar' } // TODO: it will receive package name from trader
  try {
    if (!this.downloaded) {
      this._init(packageName)
      trader.machineUpdate(this.downloadHandler, { packagePath: this.packagePath })
    } else {
      if (fs.existsSync(this.packagePath)) {
        this._extract()
      }
      if (fs.existsSync(this.extractPath)) {
        return
        // Trigger watchdog
      }
    }
  } catch (err) {
    this.downloaded = false
    console.error(err)
  }
}

NewUpdater.factory = config => new NewUpdater(config)
const updater = NewUpdater.factory(config)

module.exports = updater
