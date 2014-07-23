'use strict';

var https = require('https');
var fs = require('fs');
var path = require('path');

var deviceConfig = JSON.parse(fs.readFileSync('/opt/apps/machine/lamassu-machine/device_config.json'));
var ca = fs.readFileSync(deviceConfig.updater.caFile);
var cert = fs.readFileSync(path.resolve(deviceConfig.brain.dataPath, 'client.pem'));
var key = fs.readFileSync(path.resolve(deviceConfig.brain.dataPath, 'client.key'));

function report(err, res, cb) {
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
    key: key,
    cert: cert,
    ca: ca,
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
}

report(null, 'started', function() {});

var async = require('./async');

process.on('SIGUSR2', function() {
  // USR1 is reserved by node
  // TODO: more graceful exit
  console.log('Got SIGUSR2. Immune.');
});

var detectedVersion = fs.existsSync('/opt/sencha-brain') ? 'Version 64' : 'Not version 64';

async.waterfall([
  async.apply(report, null, detectedVersion)
], function(err) {
  report(err, 'finished', function() {
    if (err) throw err;
    console.log('done updatescript');
    process.exit();    
  });
});
