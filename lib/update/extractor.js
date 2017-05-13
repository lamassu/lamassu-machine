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

Extractor.prototype._verifyIntegrity = function _verifyIntegrity (cb) {
  var finder = findit(this.rootPath)
  var self = this
  var paths = []

  // Compile a list of all the paths
  var hashListPath = this.rootPath + '/package/hashlist.json'
  finder.on('file', function (filePath) {
    if (filePath !== hashListPath) paths.push(filePath)
  })

  // Concurrently compute hashes and update the hashList for all paths
  finder.on('end', function () {
    async.eachLimit(paths, CONCURRENCY, function (filePath, lcb) {
      self._updateHashList(lcb, filePath)
    }, cb)
  })
}

Extractor.prototype._updateHashList = function _updateHashList (cb, filePath) {
  var sha2 = crypto.createHash(this.config.hashAlg)
  var fd = fs.createReadStream(filePath)
  var relativePath = filePath.substr(this.rootPath.length + 1)
  var self = this

  sha2.setEncoding('hex')
  fd.on('end', function () {
    sha2.end()
    var hash = sha2.read()
    if (!self.hashList[relativePath]) {
      cb(new Error('Extra file that was not in package manifest: ' +
      relativePath))
      return
    }
    self.hashList[relativePath].computedHash = hash
    cb()
  })
  fd.on('error', cb)
  fd.pipe(sha2)
}

Extractor.prototype._verifyManifest = function _verifyManifest (cb) {
  this.manifestPath = this.rootPath + '/package/hashlist.json'
  var pubKey = this.lamassuPubKey
  var sig = this.hashListSig
  var input = fs.createReadStream(this.manifestPath)
  var verifier = crypto.createVerify(this.config.sigAlg)
  input.pipe(verifier)
  input.on('error', cb)
  input.on('end', function () {
    var success = verifier.verify(pubKey, sig, 'hex')
    if (success) cb()    // success
    else cb(new Error('Manifest signature invalid!'))
  })
}

Extractor.prototype._verifyHashList = function _verifyHashList (cb) {
  var self = this
  fs.readFile(this.manifestPath, {encoding: 'utf8'}, function (err, data) {
    if (err) {
      cb(err)
    } else {
      self.hashList = JSON.parse(data)
      cb()   // success
    }
  })
}

Extractor.prototype._inspectHashList = function _inspectHashList (cb) {
  var hashList = this.hashList

  for (var path in hashList) {
    var res = hashList[path]
    var computedHash = res.computedHash
    var signedHash = res.signedHash
    if (!computedHash) {
      cb(new Error('Missing file from package manifest: ' + path))
      return
    } else if (signedHash !== computedHash) {
      var msg = util.format(
        "Hashes don't match for: %s; computedHash: %s, signedHash: %s",
        path, computedHash, signedHash)
      cb(new Error(msg))
      return
    }
  }

  cb()   // success
}

Extractor.prototype._cleanUp = function _cleanUp (cb) {
  var command = 'rm -rf ' + this.rootPath
  console.log(command)
  cp.exec(command, null, cb)
}

module.exports = Extractor
