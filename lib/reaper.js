'use strict';

var net = require('net');

var connected = false;
var retries = 0;
var maxRetries = 3;

function connect() {
  var client = net.connect('/tmp/heartbeat.sock', function() {
    connected = true;
    console.log('connected.');
  });

  client.on('error', function(err) {
    connected = false;
    console.log(err.message);
  });

  client.on('end', function() {
    connected = false;
    console.log('server disconnected');
  });

  client.on('data', function(data) {
    connected = true;
    console.log(data.toString());
  });
}

connect();

setInterval(function() {
  if (connected) {
    retries = 0;
    return;
  }
  retries += 1;
  if (retries > maxRetries) {
    console.log('lamassu-machine is stuck, rebooting...');
  }
  connect();
}, 10000);

