var net = require('net')
var cp = require('child_process')

var connected = false
var heartbeatCount = 0
var retries = 0
var maxRetries = 3

function connect () {
  var client = net.connect('/tmp/heartbeat.sock', function () {
    connected = true
    console.log('connected.')
  })

  client.on('error', function (err) {
    connected = false
    console.log(err.message)
  })

  client.on('end', function () {
    connected = false
    console.log('server disconnected')
  })

  client.on('data', function () {
    heartbeatCount = 0
  })
}

connect()

setInterval(function () {
  if (connected) {
    if (heartbeatCount > maxRetries) {
      console.log('no heartbeat. lamassu-machine is stuck, rebooting...')
      powerOff()
      return
    }
    heartbeatCount += 1
    retries = 0
    return
  }
  retries += 1
  if (retries > maxRetries) {
    console.log('lamassu-machine is stuck, rebooting...')
    powerOff()
  }
  connect()
}, 10000)

function powerOff () {
  cp.execFile('poweroff', ['-d', '2'], {}, function () {
    process.exit(0)
  })
}
