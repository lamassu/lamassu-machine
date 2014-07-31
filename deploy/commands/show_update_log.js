'use strict';

var https = require('https');
var fs = require('fs');

var Report = require('./report');
var report = Report.report;
var async = require('./async');

var hardwareCode = process.argv[2] || 'N7G1';

var updateLogFile = hardwareCode === 'N7G1' ?
  '/var/lib/sencha/log/updater.log' :
  '/var/log/upstart/lamassu-updater.log';

var watchdogLogFile = hardwareCode === 'N7G1' ?
  '/var/lib/sencha/log/watchdog.log' :
  '/var/log/upstart/lamassu-extractor.log';

var certs = Report.certs();

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
        key: certs.key,
        cert: certs.cert,
        ca: certs.ca,
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

async.waterfall([
  async.apply(report, null, 'started'),
  async.apply(tailFile, updateLogFile),
  async.apply(tailFile, watchdogLogFile)
], function(err) {
  report(err, 'finished', function() {
    if (err) throw err;
    console.log('done updatescript');
    process.exit();    
  });
});
