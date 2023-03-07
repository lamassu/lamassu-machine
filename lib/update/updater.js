'use strict'

var https = require('https')
var Agent = https.Agent
var os = require('os')
var fs = require('fs')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var path = require('path')
var _ = require('lodash/fp')

var machineInfoLoader = require('../machine-info')
require('../../lite-logging')

// TODO: DON'T WRITE UPDATE PERMISSION TO DISK, KEEP IN MEMORY
// Config should be read-only, from root partition
var Updater = function (config) {
  this.config = config
  this.lastSig = null
  this.lastSigTime = null
  this.key = null
  this.ca = null
  this.httpsOptions = null
  this.extractor = require('./extractor').factory(this.config.extractor)
  this.downloading = false
  this.ack = null

  this.deviceId = this._fetchDeviceId()
  if (!this.deviceId) {
    console.log('[WARN]: Device ID could not be retrieved.')
  }
}

util.inherits(Updater, EventEmitter)
Updater.factory = function factory (config) {
  return new Updater(config)
}

Updater.prototype._fetchDeviceId = function _fetchDeviceId () {
  const netInterfaces = os.networkInterfaces()
  const mainMacAddr =
    _(netInterfaces)
      .values()
      .flatten()
      .reject(_.isMatch({ mac: '00:00:00:00:00:00' }))
      .sortBy('mac')
      .map('mac')
      .first()

  if (mainMacAddr) {
    const deviceId = mainMacAddr.replace(/:/g, '-')
    console.log(`[INFO]: The device ID is: ${deviceId}`)
    return deviceId
  }

  return null
}

Updater.prototype.exit = function exit () {
  // otherwise supervisorctl complains about exiting too quickly
  setTimeout(() => {
    console.log('Certificate files not available yet, exiting.')
  }, 1000)
}

Updater.prototype.run = function run () {
  if (!this._init()) {
    return this.exit()
  }
  this._update()
  var self = this
  setInterval(function () { self._update() }, this.config.updateInterval)
  setInterval(function () { self._die() }, this.config.deathInterval)
}

Updater.prototype.acknowledge = function acknowledge (ack) {
  this.ack = ack
}

// private

function fetchVersion (config) {
  const str = fs.readFileSync(config.packageJsonDir + '/package.json')
  const packageJson = JSON.parse(str)
  return packageJson.version
}

function fetchPackages () {
  try {
    var manifest = JSON.parse(fs.readFileSync('/opt/apps/machine/manifest.json'))
    return manifest.packages || []
  } catch (ex) {
    return []
  }
}

Updater.prototype._init = function _init () {
  var dataPath = path.resolve(__dirname, '..', '..', this.config.dataPath)

  var certs = {
    certFile: path.resolve(dataPath, this.config.certs.certFile),
    keyFile: path.resolve(dataPath, this.config.certs.keyFile)
  }

  if (!fs.existsSync(certs.keyFile) || !fs.existsSync(certs.certFile)) {
    return false
  }

  this.key = fs.readFileSync(certs.keyFile)
  this.cert = fs.readFileSync(certs.certFile)
  var downloadDir = this.config.downloadDir
  var packagePath = this.config.downloadDir + '/update.tar'
  if (fs.existsSync(downloadDir)) {
    if (fs.existsSync(packagePath)) fs.unlinkSync(packagePath)
  } else {
    fs.mkdirSync(downloadDir)
  }

  this.version = fetchVersion(this.config)
  this.installedPackages = fetchPackages()

  this.ca = fs.readFileSync(this.config.caFile)
  this.httpsOptions = this._httpsOptions()
  return true
}

Updater.prototype._die = function _die () {
  if (this.downloading) return
  process.exit(0)
}

Updater.prototype._httpsOptions = function _httpsOptions () {
  var config = this.config
  var options = {
    host: config.host,
    port: config.port,
    path: config.path,
    key: this.key,
    cert: this.cert,
    ca: this.ca,
    ciphers: 'AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
    secureProtocol: 'TLSv1_method',
    rejectUnauthorized: true,
    headers: {
      'application-version': this.version,
      'installed-packages': this.installedPackages.join(','),
      'device-id': this.deviceId
    }
  }
  options.agent = new Agent(options)
  options.agent.keepAlive = true

  return options
}

Updater.prototype._readyForDownload = function _readyForDownload () {
  var t0 = this.lastSigTime
  var t1 = new Date().getTime()
  var timeLock = this.config.timeLock
  var ready = (t0 !== null) && (t1 - t0 > timeLock)
  return ready
}

Updater.prototype._preUpdate = function _preUpdate () {
  var options = this.httpsOptions
  options.method = 'HEAD'
  var self = this
  var req = https.request(options, function (res) {
    var contentSig = res.headers['content-sig']
    if (contentSig !== self.lastSig) {
      self.lastSig = contentSig
      self.lastSigTime = new Date().getTime()
    }
  }).on('error', function (err) { self.emit('error', err) })
  req.end()
}

Updater.prototype._update = function _update () {
  // this._preUpdate()
  // if (this._readyForDownload()) this._download()
  this._download()
}

function noop () {}

Updater.prototype.updateHeaders = function updateHeaders (options) {
  var dataPath = path.resolve(__dirname, '../..', this.config.dataPath)
  var machineInfo = machineInfoLoader.load(dataPath)
  var watchdogInfo = null
  try {
    const watchdogPath = path.resolve(__dirname, '../..', this.config.dataPath, 'watchdog-info.json')
    watchdogInfo = JSON.parse(fs.readFileSync(watchdogPath))
  } catch (err) {
    watchdogInfo = {}
  }

  if (machineInfo.active) {
    options = _.assign(options, {
      'device-machine-id': machineInfo.deviceId,
      'device-machine-name': machineInfo.deviceName
    })
  }
  if (watchdogInfo.model || watchdogInfo.platform) {
    console.log('we got here')
    options = _.assign(options, {
      'device-machine-model': watchdogInfo.model,
      'device-machine-platform': watchdogInfo.platform
    })
  }
  return options
}

Updater.prototype._download = function _download () {
  if (this.downloading) return
  var self = this
  this.httpsOptions.headers = this.updateHeaders(this.httpsOptions.headers)
  https.get(this.httpsOptions, function (res) {
    var code = res.statusCode
    switch (code) {
      case 304:
        res.resume()
        break
      case 412:
        res.resume()
        self.emit('error', new Error('Server has lower version!'))
        break
      case 200:
        self._downloadFile(res)
        break
      default:
        res.resume()
        this.emit('error', new Error('Unknown response code: ' + code))
    }
  }).on('error', noop)
}

Updater.prototype._downloadFile = function _downloadFile (res) {
  if (this.downloading) return
  this.downloading = true

  var contentVersion = res.headers['content-version']
  var pgpSignature1 = res.headers['pgp-sig-a'].replace(/#/g, '\n')
  var pgpSignature2 = res.headers['pgp-sig-b'].replace(/#/g, '\n')

  /*  if (!this._readyForDownload()) return TODO add back
    if (contentSig !== lastSig) {
      this.emit('error', new Error('Content signature mismatch! lastSig: ' +
          lastSig + ', contentSig: ' + contentSig))
      return
    }
  */
  this.version = contentVersion
  var self = this
  var packagePath = this.config.downloadDir + '/update.tar'
  var downloadDir = this.config.downloadDir
  var fileOut = fs.createWriteStream(packagePath)
  res.pipe(fileOut)
  res.on('end', function () {
    if (res.complete) {
      self._extract({
        rootPath: self.config.extractDir,
        filePath: packagePath,
        pgpSignature1: pgpSignature1,
        pgpSignature2: pgpSignature2,
        downloadDirPath: downloadDir,
      })
    }
    else {
      console.log('[WARN]: The update file we\'ve received is incomplete. ' +
                  'The connection was terminated before the whole content ' +
                  'was transmitted. The update will NOT continue.')
    }
  })
  res.on('error', function (err) {
    this.downloading = false
    self.emit('error', err)
  })
}

// TODO: Once extraction is complete, signal user to acknowledge
Updater.prototype._extract = function _extract (fileInfo) {
  var self = this
  this.extractor.extract(fileInfo, function (err) {
    if (err) {
      self.downloading = false
      self.emit('error', err)
    } else {
      self.downloading = false
      self._triggerWatchdog()
      console.log('extracted')
    }
  })
}

Updater.prototype._triggerWatchdog = function _triggerWatchdog () {
  var donePath = this.config.extractDir + '/done.txt'
  fs.writeFile(donePath, 'DONE\n', null, function (err) {
    if (err) throw err
    console.log('watchdog triggered')
  })
}

// TODO: This verifies user acknowledgement and proceeds with update execution
Updater.prototype._verifyAck = function _verifyAck () {}

module.exports = Updater

process.on('SIGUSR2', function () {
  // USR1 is reserved by node
  // TODO: more graceful exit
  console.log('Got SIGUSR2. Exiting.')
  process.exit()
})

process.on('SIGTERM', function () {
  // Immune
})

process.on('uncaughtException', console.log)
process.on('unhandledRejection', console.log)
process.on('exit', () => console.log('lamassu-updater exiting'))

var SOFTWARE_CONFIG_PATH = path.resolve(__dirname, '../../software_config.json')
var DEVICE_CONFIG_PATH = path.resolve(__dirname, '../../device_config.json')

var softwareConfig = JSON.parse(fs.readFileSync(SOFTWARE_CONFIG_PATH))
var deviceConfig = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH))
var config = softwareConfig
config = _.merge(config, deviceConfig)
config.updater.certs = config.brain.certs
config.updater.dataPath = config.brain.dataPath
var up = Updater.factory(config.updater)

up.run()

/*

5. Wait for permission (signed with private key) (*)
6. Verify hashes again (top hash HMAC, hashes of all files) (* -- same as [4])
7. Run script (*)

*/
