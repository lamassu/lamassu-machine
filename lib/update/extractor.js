var fs = require('fs')
var tar = require('tar')
var util = require('util')
var async = require('async')
var cp = require('child_process')
var EventEmitter = require('events').EventEmitter

var Extractor = function (config) {
  this.config = config
  this.rootPath = null
  this.filePath = null
  this.pgpSignatures = null
  this.downloadDirPath = null
  this.skipVerify = config.skipVerify
}

util.inherits(Extractor, EventEmitter)
Extractor.factory = function factory (config) {
  return new Extractor(config)
}

Extractor.prototype.extract = function extract (fileInfo, cb) {
  this.rootPath = fileInfo.rootPath
  this.filePath = fileInfo.filePath
  this.pgpSignatures = fileInfo.pgpSignatures
  this.downloadDirPath = fileInfo.downloadDirPath

  // TODO: use waterfall and clean up a bit
  async.series([
    this._cleanUp.bind(this),
    this._parseSignatures.bind(this),
    this._verifySig.bind(this),
    this._extractTree.bind(this)
  ], function (err) {
    if (err) {
      console.log('error: %s', err)
      //      self._cleanUp()
      cb(err)
    } else {
      cb()
    }
  })
}

Extractor.prototype._verifySig = function _verifySig (cb) {
  if (this.skipVerify) return cb()

  try {
    fs.chmodSync("verify/verify", 0o700)
    const command = `verify/verify ${this.filePath} ${this.downloadDirPath}/sig1.asc ${this.downloadDirPath}/sig2.asc`
    const result = cp.execSync(command)

    if(result.toString("utf8") === "OK\n") {
      return cb()
    } else {
      //this should't happen
      return cb(new Error(`Package verification error: ${err.output.toString("utf8")}`))
    }
  }
  catch (err) {
    return cb(new Error(`Package verification error: ${err.output.toString("utf8")}`))
  }
}

Extractor.prototype._extractTree = function _extractTree (cb) {
  var fileIn = fs.createReadStream(this.filePath)
  fileIn.pipe(tar.Extract({path: this.rootPath}))
    .on('error', cb)
    .on('end', cb)   // success
}

Extractor.prototype._cleanUp = function _cleanUp (cb) {
  var command = 'rm -rf ' + this.rootPath
  console.log(command)
  cp.exec(command, null, cb)
}

Extractor.prototype._parseSignatures = function _parseSignatures (cb) {
  var signatures = this.pgpSignatures.match(/[^#]+/g)
  if(signatures.length !== 2) {
    return cb(new Error("Signatures not parsed correctly"))
  }

  fs.writeFileSync(this.downloadDirPath + "/sig1.asc", signatures[0])
  fs.writeFileSync(this.downloadDirPath + "/sig2.asc", signatures[1])
  cb()
}

module.exports = Extractor
