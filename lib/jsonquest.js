'use strict'

var EventEmitter = require('events').EventEmitter

var MAX_SHORT_DELAY = 1000
var LONG_DELAY = 60 * 1000 // 1min
var QUICK_RETRY_PERIOD = 120 * 1000 // 120s

// var DELAY_FACTOR = 1.1

var delayCount = 0

var emitter = new EventEmitter()

var requestEncoders = {
  json: JSON,
  queryString: require('querystring')
}

var protocols = {
  http: require('http'),
  https: require('https')
}

var firstFailedRequestTs = null

function computeDelay (delayCount) {
  // To do exponential:
  // var delay = Math.min(MAX_SHORT_DELAY, 1000 * Math.pow(DELAY_FACTOR, delayCount))
  // For now, regular delay should suffice since it will take user a while to respond anyway
  return MAX_SHORT_DELAY
}

function repeatCallback (options, realCallback) {
  return function (err, res, data) {
    if (!err && res.statusCode === 500) {
      return realCallback(new Error('Server error'))
    }

    if (!err && res.statusCode === 404) {
      return realCallback(new Error('Resource not found'))
    }

    var noRetry = (res && res.statusCode >= 200 && res.statusCode < 300)
    if (!err && noRetry) {
      if (firstFailedRequestTs) {
        emitter.emit('networkUp')
      }
      firstFailedRequestTs = null
      return realCallback(null, res, data)
    }

    if (!firstFailedRequestTs) {
      firstFailedRequestTs = Date.now()
    }

    var delay = computeDelay(delayCount)
    delayCount++

    if (firstFailedRequestTs + QUICK_RETRY_PERIOD < Date.now()) {
      realCallback('Network Error')

      // prevent realCallback being called more than once
      realCallback = function () {}

      emitter.emit('networkDown')
      delay = LONG_DELAY
    }

    setTimeout(function () {
      _request(options, realCallback)
    }, delay)
  }
}

function request (options, callback) {
  if (options.repeatUntilSuccess) {
    delayCount = 0
    firstFailedRequestTs = null
  }
  _request(options, callback)
}

function _request (options, callback) {
  var protocol = protocols[options.protocol || 'http']
  var req
  var peerDeviceId

  if (!protocol) {
    throw new Error('Unsupported protocol: ' + options.protocol)
  }
  var encoderType = options.requestEncoding || 'json'
  var encoder = requestEncoders[encoderType]
  if (!encoder) {
    throw new Error('Unsupported requestEncoding: ' + options.requestEncoding)
  }
  var contentType = encoderType === 'json'
  ? 'application/json'
  : 'application/x-www-form-urlencoded'

  var headers = options.headers ||
    (options.body ? {'content-type': contentType} : {})

  req = protocol.request({
    host: options.host,
    port: options.port,
    path: options.path,
    auth: options.auth,
    method: options.method,
    key: options.key,
    cert: options.cert,
    ciphers: 'AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
    secureProtocol: 'TLSv1_method',
    headers: headers,
    rejectUnauthorized: options.rejectUnauthorized,
    agent: false
  })

  if (!options.deviceId) {
    if (options.body) return req.end(encoder.stringify(options.body))
    req.end()
  }

  var deviceIdValid = !options.deviceId

  var _callback = options.repeatUntilSuccess
  ? repeatCallback(options, callback)
  : callback

  req.on('error', function (err) {
    console.log(err.stack)
    _callback(err)
  })

  req.on('socket', function (socket) {
    if (!options.deviceId) return

    socket.on('secureConnect', function () {
      var cert = socket.getPeerCertificate()
      peerDeviceId = cert ? cert.fingerprint : null

      if (options.deviceId !== peerDeviceId) return req.end()

      deviceIdValid = true
      var str = encoder.stringify(options.body)
      req.end(str)
    })
  })

  req.on('response', function (res) {
    res.peerDeviceId = peerDeviceId

    var data = ''
    res.on('data', function (chunk) {
      data += chunk.toString('utf8')
    })

    res.on('end', function () {
      if (!deviceIdValid) {
        return _callback(new Error("Peer device id doesn't match!"))
      }

      var parsed
      try {
        parsed = JSON.parse(data)
      } catch (ex) {
        console.log('data: %s', data)
        return _callback(new Error('Invalid json'))
      }

      _callback(null, res, parsed)
    })
  })
}

module.exports = request
module.exports.protocols = protocols
module.exports.emitter = emitter
