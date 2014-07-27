// Note: this is currently useful for versions of sencha-brain on the aaeon system.

'use strict';

var https = require('https');
var fs = require('fs');
var path = require('path');

function loadCerts() {
  var config;

  // New lamassu-machine
  if (fs.existsSync('/opt/apps/machine/lamassu-machine')) {
    config = JSON.parse(fs.readFileSync('/opt/apps/machine/lamassu-machine/device_config.json'));
    if (fs.existsSync(config.updater.caFile)) return {
      ca: fs.readFileSync(config.updater.caFile),
      cert: fs.readFileSync(path.resolve(config.brain.dataPath, 'client.pem')),
      key: fs.readFileSync(path.resolve(config.brain.dataPath, 'client.key'))   
    };
  }

  // Nexus7 sencha-brain
  if (fs.existsSync('/usr/local/share/sencha/certs/')) {
    config = JSON.parse(fs.readFileSync('/usr/local/share/sencha/node/sencha-brain/software_config.json'));
    return {
      ca: fs.readFileSync(config.updater.caFile),
      cert: fs.readFileSync(config.updater.certFile),
      key: fs.readFileSync(config.updater.keyFile)      
    };
  }

  // sencha-brain aaeons
  var baseDir = fs.existsSync('/opt/sencha-brain') ? '/opt' : '/home/iva';
  config = JSON.parse(fs.readFileSync(baseDir + '/sencha-brain/device_config.json'));

  return {
    ca: fs.readFileSync(config.updater.caFile),
    cert: fs.readFileSync(config.brain.certs.certFile),
    key: fs.readFileSync(config.brain.certs.keyFile)
  };
}

var certs = loadCerts();

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
    key: certs.key,
    cert: certs.cert,
    ca: certs.ca,
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
