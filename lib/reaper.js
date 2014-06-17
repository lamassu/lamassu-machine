'use strict';

var cp = require('child_process');

var TIMEOUT = 5000;

var lastHeartbeat = Date.now();

process.on('SIGTERM', function() {
  // Immune
});

process.on('message', function (msg) {
  if (msg.heartbeat) lastHeartbeat = Date.now();
});

function checkHeartbeat() {
  var now = Date.now();
  if (now - lastHeartbeat > TIMEOUT) {
    cp.execFile('killall', ['node']);
    process.exit();
  }
}

setInterval(checkHeartbeat, TIMEOUT);
