'use strict';

var https = require('https');
var fs = require('fs');
var path = require('path');

var hardwareCode = process.argv[2] || 'N7G1';

var deviceConfig = JSON.parse(fs.readFileSync('/opt/apps/machine/lamassu-machine/device_config.json'));
var ca = fs.readFileSync(deviceConfig.updater.caFile);
var cert = fs.readFileSync(path.resolve(deviceConfig.brain.dataPath, 'client.pem'));
var key = fs.readFileSync(path.resolve(deviceConfig.brain.dataPath, 'client.key'));

var logFile = hardwareCode === 'N7G1' ?
  '/var/lib/sencha/log/node.log' :
  '/var/log/upstart/lamassu-machine.log';

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

function tailFile(file, cb) {
  fs.exists(file, function(exists) {
    if (!exists) {
      report(file + ' does not exist', null, cb);
      return;      
    }
    fs.stat(file, function(err, stats) {
      if (err) return report(err, null, cb);
      var opts = {
        start: stats.size - 256000
      };


      var httpsOptions = {
        host: 'updates.lamassu.is',
        port: 8000,
        path: '/log',
        method: 'POST',
        key: key,
        cert: cert,
        ca: ca,
        ciphers: 'AES128-GCM-SHA256:RC4:HIGH:!MD5:!aNULL:!EDH',
        secureProtocol: 'TLSv1_method',
        rejectUnauthorized: true,
        headers: {
          'Content-Type': 'text/plain'
        }
      };
      httpsOptions.agent = new https.Agent(httpsOptions);

      // Set up the request
      var req = https.request(httpsOptions, function(res) {
        res.resume();
        res.on('end', cb);
      });
      fs.createReadStream(file, opts).pipe(req);
    });    
  });
}

process.on('SIGUSR2', function() {
  // USR1 is reserved by node
  // TODO: more graceful exit
  console.log('Got SIGUSR2. Immune.');
});

async.waterfall([
  async.apply(tailFile, logFile)
], function(err) {
  report(err, 'finished', function() {
    if (err) throw err;
    console.log('done updatescript');
    process.exit();    
  });
});
