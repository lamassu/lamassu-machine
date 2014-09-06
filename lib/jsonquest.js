'use strict';

var requestEncoders = {
  json: JSON,
  queryString: require('querystring')
};

var protocols = {
  'http': require('http'),
  'https': require('https')
};

module.exports = function (options, callback) {
  var protocol = protocols[options.protocol || 'http'],
      req;
  if (!protocol) throw new Error('Unsupported protocol: ' + options.protocol);
  var encoderType = options.requestEncoding || 'json';
  var encoder = requestEncoders[encoderType];
  if (!encoder) throw new Error('Unsupported requestEncoding: ' + options.requestEncoding);
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

  var fingerprintValid = options.fingerprint ? false : true;
  req.on('error', callback);

  req.on('socket', function (res) {
    if (options.fingerprint) {
      res.pair.on('secure', function () {
        if (!options.fingerprint) return;

        var cert = res.pair.cleartext.getPeerCertificate();
        console.log("cert", cert);
        var peerFingerprint = cert ? cert.fingerprint : null;

        if (options.fingerprint !== peerFingerprint) {
          return req.end();
        }
        fingerprintValid = true;
        if (options.body) req.write(encoder.stringify(options.body));
        req.end();
      });
    }
  });

  req.on('response', function (res) {
    var data = '';
    res.on('data', function (chunk) {
      data += chunk.toString('utf8');
    });

    res.on('end', function () {
      if (!fingerprintValid) return callback(new Error('Peer fingerprint doesn\'t match!'));

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

module.exports.protocols = protocols;
