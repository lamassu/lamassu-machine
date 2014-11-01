'use strict';

var SHORT_DELAY = 1000; // 1s
var LONG_DELAY = 60 * 1000; // 1min
var QUICK_RETRY_PERIOD = 2 * 60 * 1000; // 120s

var emit = null;

var requestEncoders = {
  json: JSON,
  queryString: require('querystring')
};

var protocols = {
  http: require('http'),
  https: require('https')
};

var firstFailedRequestTs = null;

function repeatCallback(options, realCallback) {
  return function(err, res, data) {
    if (!err && res.statusCode >= 200 && res.statusCode < 300) {
      if (firstFailedRequestTs)
        emit('networkUp');

      firstFailedRequestTs = null;
      return realCallback(null, res, data);
    }

    if (!firstFailedRequestTs)
      firstFailedRequestTs = Date.now();

    var delay = SHORT_DELAY;

    if (firstFailedRequestTs + QUICK_RETRY_PERIOD < Date.now()) {
      realCallback('Network Error');
      realCallback = function() {}; // prevent realCallback being called more than once

      emit('networkDown');
      delay = LONG_DELAY;
    }

    setTimeout(function() {
      request(options, realCallback);
    }, delay);

  };
}

function request(options, callback) {
  var protocol = protocols[options.protocol || 'http'],
      req;

  if (!protocol)
    throw new Error('Unsupported protocol: ' + options.protocol);

  var encoderType = options.requestEncoding || 'json';
  var encoder = requestEncoders[encoderType];
  if (!encoder)
    throw new Error('Unsupported requestEncoding: ' + options.requestEncoding);

  var contentType = encoderType === 'json' ?
    'application/json' :
    'application/x-www-form-urlencoded';

  var headers = options.headers || (options.body ? {'content-type': contentType} : {});

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
  });

  if (!options.fingerprint) {
    if (options.body) req.write(encoder.stringify(options.body));
    req.end();
  }

  var fingerprintValid = !options.fingerprint;

  var _callback = options.repeatUntilSuccess ?
    repeatCallback(options, callback) :
    callback;

  req.on('error', _callback);

  req.on('socket', function (res) {
    if (!options.fingerprint) return;

    res.pair.on('secure', function () {
      if (!options.fingerprint) return;

      var cert = res.pair.cleartext.getPeerCertificate();
      var peerFingerprint = cert ? cert.fingerprint : null;

      if (options.fingerprint !== peerFingerprint) {
        return req.end();
      }
      fingerprintValid = true;
      if (options.body) req.write(encoder.stringify(options.body));
      req.end();
    });

  });

  req.on('response', function (res) {

    var data = '';
    res.on('data', function (chunk) {
      data += chunk.toString('utf8');
    });

    res.on('end', function () {
      if (!fingerprintValid)
        return _callback(new Error('Peer fingerprint doesn\'t match!'));

      var parsed;
      try {
        parsed = JSON.parse(data);
      }
      catch (ex) {
        return _callback(new Error('Invalid json'));
      }

      _callback(null, res, parsed);
    });
  });
};

module.exports = request;
module.exports.setEmitter = function setEmitter(emitFn) {
  emit = emitFn;
};
module.exports.protocols = protocols;
