'use strict';

var fs = require('fs');
var SOFTWARE_CONFIG_PATH = '/usr/local/share/sencha/node/sencha-brain/software_config.json';
var softwareConfig = null;

try {
  softwareConfig = JSON.parse(fs.readFileSync(SOFTWARE_CONFIG_PATH));
} catch (ex) {
  softwareConfig = require('/usr/local/share/sencha/config/configfile');  
}

var config = softwareConfig.updater.extractor;
config.skipVerify = true;
var extractor = require('/usr/local/share/sencha/node/sencha-brain/lib/update/extractor').factory(config);

var fileInfo = {
  rootPath: '/tmp/extract',
  filePath: '/tmp/update.tar' 
};

function triggerWatchdog(cb) {
  var donePath = '/tmp/extract/done.txt';
  fs.writeFile(donePath, 'DONE\n', null, function(err) {
    if (err) throw err;
    console.log('watchdog triggered');
    cb();
  });
}

process.on('SIGTERM', function() {
  // Immune
});

extractor.extract(fileInfo, function(err) {
  console.log('extracting...')
  if (err) throw err;
  triggerWatchdog(function () { console.log('all done.'); });
});

