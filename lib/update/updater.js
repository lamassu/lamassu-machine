'use strict'

var https = require('https')
var fs = require('fs')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var path = require('path')
var _ = require('lodash')

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
}

util.inherits(Updater, EventEmitter)
Updater.factory = function factory (config) {
  return new Updater(config)
}

Updater.prototype._fetchDeviceId = function _fetchDeviceId () {
  return fs.readFileSync('/sys/class/net/wlan0/address',
    {encoding: 'utf8'}).trim().replace(/:/g, '-')
}

Updater.prototype.run = function run () {
  if (!this._init()) {
    console.log('Certificate files not available yet, exiting.')
    return
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

function fetchVersion () {
  var str = fs.readFileSync('/opt/apps/machine/lamassu-machine/package.json')
  var packageJson = JSON.parse(str)
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

  this.version = fetchVersion()
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
  options.agent = new https.Agent(options)
  //  options.agent = false

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

Updater.prototype._download = function _download () {
  if (this.downloading) return
  var self = this
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
  var contentSig = res.headers['content-sig']
  var hashListSig = res.headers['content-hash-list-sig']
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
  var fileOut = fs.createWriteStream(packagePath)
  res.pipe(fileOut)
  res.on('end', function () {
    self._extract({rootPath: self.config.extractDir,
      filePath: packagePath, contentSig: contentSig,
    hashListSig: hashListSig})
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

var SOFTWARE_CONFIG_PATH = path.resolve(__dirname, '../../software_config.json')
var DEVICE_CONFIG_PATH = path.resolve(__dirname, '../../device_config.json')

var softwareConfig = JSON.parse(fs.readFileSync(SOFTWARE_CONFIG_PATH))
var deviceConfig = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH))
var config = softwareConfig
_.merge(config, deviceConfig)
config.updater.certs = config.brain.certs
config.updater.dataPath = config.brain.dataPath
var up = Updater.factory(config.updater)

up.run()

/*

5. Wait for permission (signed with private key) (*)
6. Verify hashes again (top hash HMAC, hashes of all files) (* -- same as [4])
7. Run script (*)

*/
