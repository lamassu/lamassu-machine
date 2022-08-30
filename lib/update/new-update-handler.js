const fs = require('fs')
const path = require('path')
const _ = require('lodash/fp')
var tar = require('tar')

const SOFTWARE_CONFIG_PATH = path.resolve(__dirname, '../../software_config.json')
const DEVICE_CONFIG_PATH = path.resolve(__dirname, '../../device_config.sample.json')
const softwareConfig = JSON.parse(fs.readFileSync(SOFTWARE_CONFIG_PATH))
const deviceConfig = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH))
let config = _.merge(softwareConfig, deviceConfig)
config.updater.dataPath = config.brain.dataPath

const inProgress = '/inprogress.txt'
var NewUpdater = function (config) {
  this.config = config
  this.downloadDir = config.updater.downloadDir
  this.extractDir = config.updater.extractDir
  this.updateDir = config.updater.updateDir
  this.packagePath = null
  this.extractPath = null
  this.downloaded = false
  this.finished = false
}

NewUpdater.prototype._init = function _init () {
  console.log('Preparing folders...')
  this.packagePath = this.downloadDir + '/update.tar'
  this.extractPath = this.extractDir + '/update.tar'
  this._setUpdateFlag()
  if (fs.existsSync(this.downloadDir)) {
    if (fs.existsSync(this.packagePath)) fs.unlinkSync(this.packagePath)
  } else {
    fs.mkdirSync(this.downloadDir)
  }
}

NewUpdater.prototype.isUpdating = function isUpdating () {
  const exists = fs.existsSync(this.updateDir + inProgress)
  if (exists) console.log('Update already in progress!')
  return exists
}

NewUpdater.prototype._setUpdateFlag = function _setUpdateFlag () {
  fs.mkdirSync(this.updateDir)
  return fs.writeFileSync(this.updateDir + inProgress, 'Update in progress!')
}

NewUpdater.prototype.extractor = function extractor ({ extractDir, extractPath, packagePath }) {
  if (fs.existsSync(extractDir)) {
    if (fs.existsSync(extractPath)) fs.unlinkSync(extractPath)
  } else {
    fs.mkdirSync(extractDir)
  }
  console.log(`Extracting update package...`)
  var fileIn = fs.createReadStream(packagePath)
  fileIn.pipe(tar.Extract({ path: extractDir }))
    .on('error', () => { throw Error('Error while extracting the update package!') })
    .on('end', () => { /* TODO: trigger watchdog */ })
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
      console.log(`Package downloaded to ${options.packagePath}`)
      options.extractor(options)
    })
}

NewUpdater.prototype.handleUpdateRequest = function handleUpdateRequest (trader) {
  try {
    if (this.isUpdating()) return
    this._init()
    trader.machineUpdate(this.downloadHandler, { packagePath: this.packagePath, extractor: this.extractor, extractDir: this.extractDir, extractPath: this.extractPath })
  } catch (err) {
    this.downloaded = false
    console.error(err)
  }
}

NewUpdater.factory = config => new NewUpdater(config)
const updater = NewUpdater.factory(config)

module.exports = updater
