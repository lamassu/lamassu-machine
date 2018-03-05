'use strict'

var util = require('util')
var async = require('async')
var crypto = require('crypto')
var EventEmitter = require('events').EventEmitter
var fs = require('fs')
var os = require('os')
var _ = require('lodash/fp')

var WiFi = function (config) {
  if (!(this instanceof WiFi)) return new WiFi(config)
  EventEmitter.call(this)
  this.config = config
  this.wpa = require('./wpacli').factory(config.wpa)
  this.scanTimer = null
}
util.inherits(WiFi, EventEmitter)

WiFi.prototype.startScanning = function startScanning () {
  var self = this
  self._scan()
  this.scanTimer =
    setInterval(function () { self._scan() }, this.config.scanInterval)
}

WiFi.prototype._scan = function _scan () {
  var self = this

  if (hasActiveInterfaces()) {
    console.log('DEBUG4')
    this.emit('connected')
    return
  }

  this.wpa.command('scan')
  this.wpa.command('scan_results', function (err, res) {
    if (err) {
      // Ignore
    }
    self._handleScan(res)
  })
}

WiFi.prototype.stopScanning = function stopScanning () {
  clearInterval(this.scanTimer)
}

function hasActiveInterfaces () {
  const networks = os.networkInterfaces()

  return _.some(([key, val]) => {
    if (key === 'usb0') return false
    return _.some(r => r.family === 'IPv4' && !r.internal, val)
  }, _.toPairs(networks))
}

WiFi.prototype.status = function status (cb) {
  // First check existing connections
  console.log('DEBUG1')
  if (hasActiveInterfaces()) return cb(null, 'connected')
  console.log('DEBUG2')

  this.wpa.command('status', function (err, res) {
    if (err) {
      cb(err)
      return
    }
    var networkStatus = /^wpa_state=([A-Z_0-9]+)/m.exec(res)[1]
    var ipAddressMatch = /^ip_address=([0-9\.]+)/m.exec(res)
    var ipAddress = null
    if (ipAddressMatch) ipAddress = ipAddressMatch[1]
    switch (networkStatus) {
      case 'COMPLETED':
        console.log('DEBUG3')
        cb(null, 'connected', ipAddress)
        break
      case 'INACTIVE':
      case 'DISCONNECTED':
        cb(null, 'disconnected')
        break
      case 'SCANNING':
      case 'AUTHENTICATING':
      case 'ASSOCIATING':
      case 'ASSOCIATED':
      case '4WAY_HANDSHAKE':
      case 'GROUP_HANDSHAKE':
      case 'INTERFACE_DISABLED': // TODO could be temporary on startup, need more checks
        cb(null, 'pending')
        break

      default:
        cb(new Error('bad wpa state: ' + networkStatus))
    }
  })
}

WiFi.prototype.connect = function connect (rawSsid, ssid, pass, gcb) {
  var self = this
  var localPsk = null
  async.waterfall([
    function (cb) {
      self.wpa.command('add_network', function (err, res) {
        if (err) {
          cb(err)
          return
        }
        var networkId = parseInt(/^\d+$/m.exec(res)[0], 10)
        cb(null, networkId)
      })
    },
    function (networkId, cb) {
      var hexSsid = self._encodeHex(ssid)
      var cmd = ['set_network', networkId, 'ssid', hexSsid]
      self.wpa.command(cmd, function (err, res) {
        if (err) {
          cb(err)
          return
        }
        var status = /^(OK|FAIL)$/m.exec(res)[0]
        if (status === 'OK') {
          cb(null, networkId)
        } else {
          cb(new Error('Setting ssid failed'))
        }
      })
    },
    function (networkId, cb) {
      var cmd = ['set_network', networkId, 'scan_ssid', 1]
      self.wpa.command(cmd, function (err, res) {
        if (err) {
          cb(err)
          return
        }
        var status = /^(OK|FAIL)$/m.exec(res)[0]
        if (status === 'OK') {
          cb(null, networkId)
        } else {
          cb(new Error('Setting scan_ssid failed'))
        }
      })
    },
    function (networkId, cb) {
      var cmd = ['set_network', networkId, 'key_mgmt', 'WPA-PSK']
      self.wpa.command(cmd, function (err, res) {
        if (err) {
          cb(err)
          return
        }
        var status = /^(OK|FAIL)$/m.exec(res)[0]
        if (status === 'OK') {
          cb(null, networkId)
        } else {
          cb(new Error('Setting key_mgmt failed'))
        }
      })
    },
    function (networkId, cb) {
      self._psk(rawSsid, pass, function (err, psk) {
        if (err) return cb(err)
        localPsk = psk
        cb(null, networkId, psk)
      })
    },
    function (networkId, psk, cb) {
      var cmd = ['set_network', networkId, 'psk', psk]
      self.wpa.command(cmd, function (err, res) {
        if (err) {
          cb(err)
          return
        }
        var status = /^(OK|FAIL)$/m.exec(res)[0]
        if (status === 'OK') {
          cb(null, networkId)
        } else {
          cb(new Error('Setting network failed'))
        }
      })
    },
    function (networkId, cb) {
      var cmd = ['select_network', networkId]
      self.wpa.command(cmd, function (err, res) {
        if (err) {
          cb(err)
          return
        }
        var status = /^(OK|FAIL)$/m.exec(res)[0]
        if (status === 'OK') {
          cb(null)
        } else {
          cb(new Error('Selecting network failed'))
        }
      })
    },
    function (cb) {
      self.waitConnection(function (err, ip) {
        if (err) return cb(err)
        self._writeConfig(ssid, localPsk, function (err) {
          if (err) return cb(err)
          cb(null, ip)
        })
      })
    }
  ], gcb)
}

WiFi.prototype._encodeHex = function _encodeHex (str) {
  var buf = new Buffer(str)
  return buf.toString('hex')
}

WiFi.prototype._unescapeHex = function _unescapeHex (str) {
  var len = str.length
  var i = 0
  var arr = []

  while (i < len) {
    var currentChar = str[i++]
    switch (currentChar) {
      case '\\':
        var escapedChar = str[i++]
        switch (escapedChar) {
          case 'x':
            var hexCode = str.substr(i, 2)
            var code = parseInt(hexCode, 16)
            arr.push(code)
            i += 2
            break
          case '\\':
            arr.push('\\'.charCodeAt(0))
            break
          case 't':
            arr.push('\t'.charCodeAt(0))
            break
          case '"':
            arr.push('"'.charCodeAt(0))
            break
        }
        break
      default:
        arr.push(currentChar.charCodeAt(0))
    }
  }

  return new Buffer(arr).toString()
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
      console.log('DEBUG5: %s', connectionStatus)
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
        } else setTimeout(lcb, self.config.checkInterval)
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
      console.log('DEBUG7')
      cb(null, ip)
    }
  )
}

WiFi.prototype._handleScan = function _handleScan (res) {
  var results = []
  var lines = res.split('\n')

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    var parsed = line.split('\t')
    if (parsed.length < 5) continue
    var strength = this._strength(parseInt(parsed[2], 10))
    var rawSsid = parsed[4]
    if (rawSsid.length === 0) continue
    var ssid = this._unescapeHex(rawSsid)
    var displaySsid = this.displaySsid(ssid)
    var rec = {bssid: parsed[0],
      strength: strength,
      security: parsed[3],
      ssid: ssid,
      displaySsid: displaySsid,
      rawSsid: rawSsid}
    results.push(rec)
  }

  var sortedResults = results.sort(function (a, b) {
    return b.strength - a.strength
  })
  this.emit('scan', sortedResults)
}

WiFi.prototype.displaySsid = function displaySsid (ssid) {
  return this._truncate(ssid, this.config.truncateLength)
}

WiFi.prototype._truncate = function _truncate (str, len) {
  if (str.length > len) {
    const actualLen = len - 2
    const beginLen = Math.floor(actualLen / 2)
    const endLen = actualLen - beginLen
    const endIndex = str.length - endLen
    return str.substr(0, beginLen) + '..' + str.substr(endIndex)
  } else return str
}

WiFi.prototype._strength = function _strength (signal) {
  // The assumption is that -50 is great, -100 is terrible
  var maxSignal = this.config.maxSignal
  var minSignal = this.config.minSignal
  var ratio = (minSignal - signal) / (minSignal - maxSignal)
  if (ratio >= 1) ratio = 0.99
  if (ratio < 0) ratio = 0
  return ratio
}

WiFi.prototype._psk = function _psk (ssid, password, cb) {
  var iterations = 4096
  var keylen = 32
  var salt = ssid
  crypto.pbkdf2(password, salt, iterations, keylen, function (err, key) {
    if (err) cb(err)
    else cb(null, key.toString('hex'))
  })
}

WiFi.prototype._writeConfig = function _writeConfig (ssid, psk, cb) {
  var config = 'network={\n' +
    '  ssid="' + ssid + '"\n' +
    '  psk=' + psk + '\n' +
    '}\n'
  var configPath = this.config.wpaConfigPath
  fs.writeFile(configPath, config, cb)
}

WiFi.prototype.clearConfig = function clearConfig (cb) {
  var configPath = this.config.wpaConfigPath
  fs.writeFile(configPath, 'network={\n}\n', cb)
}

module.exports = WiFi
