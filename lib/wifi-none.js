const EventEmitter = require('events').EventEmitter
const util = require('util')

var WiFi = function (config) {
  EventEmitter.call(this)
}
util.inherits(WiFi, EventEmitter)

WiFi.prototype.startScanning = function startScanning () {
}

WiFi.prototype.stopScanning = function stopScanning () {
}

WiFi.prototype.status = function status (cb) {
  return cb(null, 'connected')
}

WiFi.prototype.connect = function connect (rawSsid, ssid, pass, gcb) {
  return gcb()
}

WiFi.prototype.waitConnection = function waitConnection (cb) {
  return cb()
}

WiFi.prototype.clearConfig = function clearConfig (cb) {
  return cb()
}

module.exports = WiFi
