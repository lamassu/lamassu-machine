'use strict';

var https = require('https');
var fs = require('fs');
var path = require('path');

function loadCerts() {
  var config;

  // ssuboard & aaeon-upboard
  if (fs.existsSync('/opt/lamassu-machine')) {
    config = JSON.parse(fs.readFileSync('/opt/lamassu-machine/device_config.json'));
    if (fs.existsSync(config.updater.caFile)) return {
      ca: fs.readFileSync(config.updater.caFile),
      cert: fs.readFileSync(path.resolve('/opt/lamassu-machine', config.brain.dataPath, 'client.pem')),
      key: fs.readFileSync(path.resolve('/opt/lamassu-machine', config.brain.dataPath, 'client.key'))
    };
  }

  // aaeon-acp (pre-convergence)
  if (fs.existsSync('/opt/apps/machine/lamassu-machine')) {
    config = JSON.parse(fs.readFileSync('/opt/apps/machine/lamassu-machine/device_config.json'));
    if (fs.existsSync(config.updater.caFile)) return {
      ca: fs.readFileSync(config.updater.caFile),
      cert: fs.readFileSync(path.resolve(config.brain.dataPath, 'client.pem')),
      key: fs.readFileSync(path.resolve(config.brain.dataPath, 'client.key'))
    };
  }
}

var _certs = loadCerts();

module.exports.report = function report(err, res, cb) {
  console.log(res);
  var data = JSON.stringify({
    error: err ? err : null,
    result: res
  });

  var options = {
    host: 'updates.lamassu.is',
    port: 8000,
    path: '/report',
    method: 'POST',
    key: _certs.key,
    cert: _certs.cert,
    ca: _certs.ca,
    ciphers: 'AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
    secureProtocol: 'TLSv1_method',
    rejectUnauthorized: true,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': data.length
    }
  };
  options.agent = new https.Agent(options);

  // Set up the request
  var req = https.request(options, function(res) {
    res.setEncoding('utf8');
    res.resume();
    res.on('end', cb);
  });

  req.on('error', function(err) { console.log(err); cb(); });
  req.write(data);
  req.end();
};

module.exports.certs = function certs() {
  return _certs;
};
