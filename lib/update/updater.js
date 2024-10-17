'use strict'

const crypto = require('crypto')
var https = require('https')
var Agent = https.Agent
var os = require('os')
var fs = require('fs')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var path = require('path')
var _ = require('lodash/fp')

var watchdogInfoLoader = require('../watchdog-info')
var log = console.log;
var error = console.error;
const lssettings = require('../db/lssettings')

console.log = function(){
  var date = (new Date).toISOString() 
  log(date, 'LOG', ...arguments)
};

console.error = function(){
  var date = (new Date).toISOString() 
  error(date, 'ERROR', ...arguments)
};

var consts =   {
  port: 8000,
  host: "updates.lamassu.is",
  updateInterval: 30000,
  deathInterval: 600000,
}

const extractDir = '/opt/lamassu-updates/extract'
const downloadDir = '/opt/lamassu-updates/download'
const packagePath = path.join(downloadDir, 'update.tar')

// TODO: DON'T WRITE UPDATE PERMISSION TO DISK, KEEP IN MEMORY
// Config should be read-only, from root partition
var Updater = function (config) {
  this.config = config
  this.lastSig = null
  this.lastSigTime = null
  this.key = null
  this.cert = null
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
  setInterval(function () { self._update() }, consts.updateInterval)
  setInterval(function () { self._die() }, consts.deathInterval)
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

Updater.prototype._init = function _init () {
  var dataPath = path.resolve(__dirname, '..', '..', this.config.dataPath)

  var certs = {
    certFile: path.resolve(dataPath, 'client.pem'),
    keyFile: path.resolve(dataPath, 'client.key')
  }

  if (!fs.existsSync(certs.keyFile) || !fs.existsSync(certs.certFile)) {
    return false
  }

  this.key = fs.readFileSync(certs.keyFile)
  this.cert = fs.readFileSync(certs.certFile)
  if (fs.existsSync(downloadDir)) {
    if (fs.existsSync(packagePath)) fs.unlinkSync(packagePath)
  } else {
    mkDirByPathSync(downloadDir)
  }

  this.version = fetchVersion(this.config)

  this.httpsOptions = this._httpsOptions()
  return true
}

Updater.prototype._die = function _die () {
  if (this.downloading) return
  process.exit(0)
}

Updater.prototype._httpsOptions = function _httpsOptions () {
  var options = {
    host: consts.host,
    port: consts.port,
    key: this.key,
    cert: this.cert,
    rejectUnauthorized: true,
    headers: {
      'application-version': this.version,
      'device-id': this.deviceId,
      'device-arch': process.arch,
      'node-version': process.version,
      'device-os': os.release()
    }
  }
  options.agent = new Agent(options)
  options.agent.keepAlive = true

  return options
}

function noop () {}

Updater.prototype.updateHeaders = function updateHeaders (headers) {
  return lssettings.loadMachineInfo().catch(() => ({ active: false }))
    .then(machineInfo => {
      var dataPath = path.resolve(__dirname, '..', '..', this.config.dataPath)
      var watchdogInfo = watchdogInfoLoader.load(dataPath)

      var connectionInfoPath = path.resolve(dataPath, 'connection_info.json')
      const connectionInfo = JSON.parse(fs.readFileSync(connectionInfoPath))

      if (connectionInfo.host) {
        headers = _.assign(headers, {
          'device-host': crypto.createHash('sha256').update(connectionInfo.host).digest('hex')
        })
      }
      if (machineInfo.active && machineInfo.deviceName) {
        headers = _.assign(headers, {
          'device-machine-name': machineInfo.deviceName
        })
      }
      if (watchdogInfo.model) {
        headers = _.assign(headers, {
          'device-machine-model': watchdogInfo.model
        })
      }
      if (watchdogInfo.platform) {
        headers = _.assign(headers, {
          'device-machine-platform': watchdogInfo.platform
        })
      }
      return headers
    })
}

Updater.prototype._update = function _update () {
  if (this.downloading) return
  return this.updateHeaders(this.httpsOptions.headers)
    .then(headers => {
      this.httpsOptions.headers = headers
      return https.get(this.httpsOptions, res => {
        var code = res.statusCode
        switch (code) {
          case 304:
            res.resume()
            break
          case 412:
            res.resume()
            this.emit('error', new Error('Server has lower version!'))
            break
          case 200:
            this._downloadFile(res)
            break
          default:
            res.resume()
            this.emit('error', new Error('Unknown response code: ' + code))
        }
      }).on('error', noop)
    })
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
  var fileOut = fs.createWriteStream(packagePath)
  res.pipe(fileOut)
  res.on('end', function () {
    this.downloading = false
    if (res.complete) {
      self._extract({
        rootPath: extractDir,
        filePath: packagePath,
        pgpSignature1: pgpSignature1,
        pgpSignature2: pgpSignature2,
        downloadDirPath: downloadDir,
      })
    } else {
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
      self.emit('error', err)
    } else {
      self._triggerWatchdog()
      console.log('extracted')
    }
  })
}

Updater.prototype._triggerWatchdog = function _triggerWatchdog () {
  const donePath = path.join(extractDir, 'done.txt')
  fs.writeFile(donePath, 'DONE\n', null, function (err) {
    if (err) throw err
    console.log('watchdog triggered')
  })
}

module.exports = Updater

// from https://stackoverflow.com/questions/31645738/how-to-create-full-path-with-nodes-fs-mkdirsync
// only here because of node 6-8
function mkDirByPathSync(targetDir, { isRelativeToScript = false } = {}) {
  const sep = path.sep;
  const initDir = path.isAbsolute(targetDir) ? sep : ''
  const baseDir = isRelativeToScript ? __dirname : '.'

  return targetDir.split(sep).reduce((parentDir, childDir) => {
    const curDir = path.resolve(baseDir, parentDir, childDir)
    try {
      fs.mkdirSync(curDir)
    } catch (err) {
      if (err.code === 'EEXIST') { // curDir already exists!
        return curDir
      }

      // To avoid `EISDIR` error on Mac and `EACCES`-->`ENOENT` and `EPERM` on Windows.
      if (err.code === 'ENOENT') { // Throw the original parentDir error on curDir `ENOENT` failure.
        throw new Error(`EACCES: permission denied, mkdir '${parentDir}'`)
      }

      const caughtErr = ['EACCES', 'EPERM', 'EISDIR'].indexOf(err.code) > -1
      if (!caughtErr || caughtErr && curDir === path.resolve(targetDir)) {
        throw err // Throw if it's just the last created dir.
      }
    }

    return curDir;
  }, initDir);
}

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

var DEVICE_CONFIG_PATH = path.resolve(__dirname, '../../device_config.json')

var config = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH))
config.updater.dataPath = config.brain.dataPath
var up = Updater.factory(config.updater)

up.run()

/*

5. Wait for permission (signed with private key) (*)
6. Verify hashes again (top hash HMAC, hashes of all files) (* -- same as [4])
7. Run script (*)

*/
