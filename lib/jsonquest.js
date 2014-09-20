'use strict';

var requestEncoders = {
  json: JSON,
  queryString: require('querystring')
};

var protocols = {
  http: require('http'),
  https: require('https')
};


// NOTE: possible states: [
//  'instant'   # omit queue; execute immediately
//  'executing' # sth is being executed; push to queue
//  'failed'    # previous attempt failed; push to queue
// ]
var requestsState = 'instant';
var requestsQueue = [];
var requestTimeout = null;

// change state of requests queue
function setState(newState) {
  // console.log('request state changed:', requestsState, '=>', newState);
  requestsState = newState;
}

// NOTE: executeRequest CANNOT permutate `request`
//       `request` MAY BE null
function _executeRequest(request) {
  setState('executing');

  if (!request && requestsQueue.length)
    request = requestsQueue.shift();

  if (!request)
    return setState('instant');

  request(function(err, req, parsed) {
    var cb = typeof request.callback === 'function' ?
      request.callback :
      function() {};

    if (err) {
      // TODO: not sure what to do in this case...
      requestsQueue.unshift(request);
      setState('failed');
      return cb(err);
    }

    if (req.statusCode >= 200 && req.statusCode < 300) {
      cb(err, req, parsed);

      // continue execution until queue is not empty
      if (requestsQueue.length)
        return _executeRequest();

      return setState('instant');
    }

    requestsQueue.unshift(request);
    setState('failed');

    cb(err, req, parsed);
  });

}

// All incoming requests should be proxied through this fn
function queueOrExecute(request) {
  if (requestsState === 'instant')
    return _executeRequest(request);

  requestsQueue.push(request);
}

// each second attempt to execute queue
setInterval(function() {
  if (requestsQueue.length === 0)
    return;

  if (requestsState === 'executing')
    return;

  _executeRequest();

}, 1000);


function getRawRequest(options, cb) {
  var rawRequest = function rawRequest(callback) {
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

    req.on('error', callback);

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
          return callback(new Error('Peer fingerprint doesn\'t match!'));

        var parsed;
        try {
          parsed = JSON.parse(data);
        }
        catch (ex) {
          return callback(new Error('Invalid json'));
        }
        callback(null, res, parsed);
      });
    });
  };

  rawRequest.callback = function(err, req, parsed) {
    cb(err, req, parsed);
    rawRequest.callback = function() {}; // ensures that callback is executed only once
  };
  return rawRequest;
}

module.exports = function (options, callback) {
  queueOrExecute(getRawRequest(options, callback));
};

module.exports.protocols = protocols;
