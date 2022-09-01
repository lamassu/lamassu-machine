const fs = require('fs')
var tar = require('tar')

var NewUpdater = function (config) {
  this.config = config
  this.inProgressFile = '/inprogress.txt'
  this.downloadDir = '/tmp/download'
  this.extractDir = '/tmp/extract'
  this.updateDir = '/tmp/update'
  this.packagePath = null
  this.extractPath = null
}

NewUpdater.prototype._init = function _init () {
  console.log('[UPDATE] Preparing folders...')
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
  const exists = fs.existsSync(this.updateDir + this.inProgressFile)
  if (exists) console.log('[UPDATE] Update already in progress!')
  return exists
}

NewUpdater.prototype._setUpdateFlag = function _setUpdateFlag () {
  fs.mkdirSync(this.updateDir)
  return fs.writeFileSync(this.updateDir + this.inProgressFile, 'Update in progress!')
}

NewUpdater.prototype.extractor = function extractor ({ extractDir, extractPath, packagePath, trader }) {
  if (fs.existsSync(extractDir)) {
    if (fs.existsSync(extractPath)) fs.unlinkSync(extractPath)
  } else {
    fs.mkdirSync(extractDir)
  }
  console.log(`[UPDATE] Extracting update package...`)
  var fileIn = fs.createReadStream(packagePath)
  fileIn.pipe(tar.Extract({ path: extractDir }))
    .on('error', () => { throw Error('Error while extracting the update package!') })
    .on('end', () => { /* TODO: trigger watchdog */
      trader.updateCompleted()
    })
}

NewUpdater.prototype.downloadHandler = function (downloadStream, options) {
  var canceled = false
  console.log('[UPDATE] Starting package download...')
  const fileWriterStream = fs.createWriteStream(options.packagePath)
  downloadStream.pipe(fileWriterStream)

  downloadStream
    .on('error', (error) => {
      canceled = true
      console.error(`[UPDATE] Download failed: ${error.message}`)
      console.log('[WARN]: The update file we\'ve received is incomplete. ' +
                  'The connection was terminated before the whole content ' +
                  'was transmitted. The update will NOT continue.')
    })

  fileWriterStream
    .on('error', (error) => {
      console.error(`[UPDATE] Could not write package to system: ${error.message}`)
    })
    .on('finish', () => {
      console.log(`[UPDATE] Package downloaded to ${options.packagePath}`)
      if (!canceled) options.extractor(options)
    })
}

NewUpdater.prototype.handleUpdateRequest = function handleUpdateRequest (trader) {
  try {
    if (this.isUpdating()) return
    this._init()
    trader.machineUpdate(this.downloadHandler, {
      packagePath: this.packagePath,
      extractor: this.extractor,
      extractDir: this.extractDir,
      extractPath: this.extractPath,
      trader })
  } catch (err) {
    this.downloaded = false
    console.error(err)
  }
}

NewUpdater.factory = () => new NewUpdater()
const updater = NewUpdater.factory()

module.exports = updater
