'use strict'

var jsonquest = require('./jsonquest')
var fs = require('fs')
var path = require('path')
var selfSign = require('./self_sign')

var Pairing = function (config) {
  if (!(this instanceof Pairing)) return new Pairing(config)
  this.config = config
  this._connectionInfo = this._fetchConnectionInfo()
}

Pairing.prototype.pair = function pair (data, cb) {
  var self = this

  var connectionInfo = data.connectionInfo
  var token = data.token

  var options = {
    method: 'POST',
    protocol: 'https',
    host: connectionInfo.host,
    port: connectionInfo.port,
    path: '/pair',
    key: this.key,
    cert: this.cert,
    rejectUnauthorized: false,  // we're dealing with self-signed certs
    body: {token: token}
  }

  jsonquest(options, function (err, res, body) {
    if (err) return cb(new Error('Connection error: ' + err.message))
    if (body.err) return cb(new Error(body.err))
    var fingerprint = res.socket.getPeerCertificate().fingerprint
    if (fingerprint !== connectionInfo.fingerprint) {
      return cb(new Error('Security Error: Server certificate not as provided'))
    }
    if (res.statusCode !== 200) {
      return cb(new Error('Server returned ' + res.statusCode + ': ' + body.err))
    }
    fs.writeFile(self.config.connectionInfoPath, JSON.stringify(connectionInfo),
      function (err) {
        if (err) return cb(err)
        self._connectionInfo = connectionInfo
        cb(null, connectionInfo)
      })
  })
}

Pairing.prototype.isPaired = function isPaired () {
  return this._connectionInfo !== null
}

Pairing.prototype.connectionInfo = function connectionInfo () {
  return this._connectionInfo
}

Pairing.prototype.hasCert = function hasCert () {
  return fs.existsSync(this.config.certs.certFile)
}

Pairing.prototype.init = function init (cb) {
  var config = this.config
  var self = this
  if (fs.existsSync(config.certs.certFile)) {
    this.key = fs.readFileSync(config.certs.keyFile)
    this.cert = fs.readFileSync(config.certs.certFile)
    return cb()
  }
  var basePath = path.dirname(this.config.certs.certFile)
  try { fs.mkdirSync(basePath) } catch (ex) {}
  selfSign.generateCertificate(function (err, certPem, keyPem) {
    if (err) return cb(err)
    try {
      fs.writeFileSync(config.certs.certFile, certPem)
      fs.writeFileSync(config.certs.keyFile, keyPem)
    } catch (ex) {
      console.log(ex)
      return cb(ex)
    }

    self.key = keyPem
    self.cert = certPem
    cb()
  })
}

Pairing.prototype.unpair = function unpair (callback) {
  this.connectionInfo = null
  fs.unlink(this.config.connectionInfoPath, callback)
}

Pairing.prototype._fetchConnectionInfo = function _fetchConnectionInfo () {
  try {
    return (JSON.parse(fs.readFileSync(this.config.connectionInfoPath)))
  } catch (ex) {
    // No pairing yet
    return null
  }
}

module.exports = Pairing
