const fs = require('fs')
var tar = require('tar')

var NewUpdater = function (config) {
  this.config = config
  this.inProgressFile = '/inprogress.txt'
  this.completeFile = '/complete.txt'
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
  return fs.existsSync(this.updateDir + this.inProgressFile)
}

NewUpdater.prototype.isComplete = function isComplete () {
  return fs.existsSync(this.extractDir + this.completeFile)
}

NewUpdater.prototype.cleanUp = function cleanUp () {
  fs.unlinkSync(this.updateDir + this.inProgressFile)
  fs.unlinkSync(this.extractDir + this.completeFile)
}

NewUpdater.prototype._setUpdateFlag = function _setUpdateFlag () {
  fs.mkdirSync(this.updateDir)
  return fs.writeFileSync(this.updateDir + this.inProgressFile, 'Update in progress!')
}

NewUpdater.prototype.extractor = function extractor () {
  if (fs.existsSync(this.extractDir)) {
    if (fs.existsSync(this.extractPath)) fs.unlinkSync(this.extractPath)
  } else {
    fs.mkdirSync(this.extractDir)
  }
  console.log(`[UPDATE] Extracting update package...`)
  var fileIn = fs.createReadStream(this.packagePath)
  fileIn.pipe(tar.Extract({ path: this.extractDir }))
    .on('error', () => { throw Error('Error while extracting the update package!') })
    .on('end', () => { this._triggerWatchdog() })
}

NewUpdater.prototype.downloadHandler = function (downloadStream) {
  var canceled = false
  console.log('[UPDATE] Starting package download...')
  const fileWriterStream = fs.createWriteStream(this.packagePath)
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
      console.log(`[UPDATE] Package downloaded to ${this.packagePath}`)
      if (!canceled) this.extractor()
    })
}

NewUpdater.prototype._triggerWatchdog = function _triggerWatchdog () {
  var donePath = this.extractDir + '/done.txt'
  fs.writeFile(donePath, 'DONE\n', null, function (err) {
    if (err) throw err
    console.log('[UPDATE] Watchdog triggered!')
  })
}

NewUpdater.factory = () => new NewUpdater()
const updater = NewUpdater.factory()

module.exports = updater
