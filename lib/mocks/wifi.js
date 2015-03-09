var util = require('util')
var EventEmitter = require('events').EventEmitter
var async = require('async')

var WiFi = function (config) {
  if (!(this instanceof WiFi)) return new WiFi(config)
  EventEmitter.call(this)
  this.config = config
  this.scanTimer = null
}
util.inherits(WiFi, EventEmitter)

WiFi.prototype.status = function status (cb) {
  return setTimeout(cb.bind(null, null, 'connected', '10.0.0.1'), 500)
}

WiFi.prototype.connect = function connect (rawSsid, ssid, pass, cb) {
  var self = this
  setTimeout(function () {
    self.waitConnection(cb)
  }, 500)
}

WiFi.prototype.waitConnection = function waitConnection (cb) {
  var connectionStatus = null
  var t0 = Date.now()
  var self = this
  var ip = null
  async.until(
    function () {
      var elapsed = Date.now() - t0
      var timeout = elapsed > self.config.connectionTimeout
      return timeout || (connectionStatus === 'connected')
    },
    function (lcb) {
      self.status(function (err, res, localIp) {
        if (err) {
          lcb(err)
          return
        }
        connectionStatus = res
        if (connectionStatus === 'connected') {
          ip = localIp
          lcb(null)
        }
        else setTimeout(lcb, self.config.checkInterval)
      })
    },
    function (err) {
      if (connectionStatus !== 'connected') {
        err = new Error("couldn't connect to wifi, check password")
      }
      if (err) {
        cb(err)
        return
      }
      cb(null, ip)
    }
  )
}

WiFi.prototype.startScanning = function startScanning () {
  var self = this
  this._scan()
  this.scanTimer =
    setInterval(function () { self._scan() }, this.config.scanInterval)
}

// @TODO: Return fake wifi scan results if needed
WiFi.prototype._scan = function _scan () {}

WiFi.prototype.stopScanning = function stopScanning () {
  clearInterval(this.scanTimer)
}

module.exports = WiFi
