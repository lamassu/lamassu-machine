var findit = require('findit')
var fs = require('fs')
var tar = require('tar')
var crypto = require('crypto')
var util = require('util')
var async = require('async')
var cp = require('child_process')
var EventEmitter = require('events').EventEmitter

var CONCURRENCY = 10

var Extractor = function (config) {
  this.config = config
  this.lamassuPubKey = fs.readFileSync(this.config.lamassuPubKeyFile)
  this.rootPath = null
  this.filePath = null
  this.manifestPath = null
  this.contentSig = null
  this.hashListSig = null
  this.skipVerify = config.skipVerify
}

util.inherits(Extractor, EventEmitter)
Extractor.factory = function factory (config) {
  return new Extractor(config)
}

Extractor.prototype.extract = function extract (fileInfo, cb) {
  this.rootPath = fileInfo.rootPath
  this.filePath = fileInfo.filePath
  this.contentSig = fileInfo.contentSig
  this.hashListSig = fileInfo.hashListSig

  // TODO: use waterfall and clean up a bit
  async.series([
    this._cleanUp.bind(this),
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

// TODO: openssl dgst -sha256 -sign big.key test.tar > text.tar.sig
Extractor.prototype._verifySig = function _verifySig (cb) {
  if (this.skipVerify) return cb()
  var pubKey = this.lamassuPubKey
  var sig = this.contentSig
  var input = fs.createReadStream(this.filePath)
  var verifier = crypto.createVerify(this.config.sigAlg)
  input.pipe(verifier)
  input.on('error', cb)
  input.on('end', function () {
    console.log(sig)
    var success = verifier.verify(pubKey, sig, 'hex')
    if (success) cb()    // success
    else cb(new Error('Package signature invalid!'))
  })
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

module.exports = Extractor
