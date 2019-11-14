// This just looks for a script file, checks it's signature, and runs it
'use strict'

var fs = require('fs')
var cp = require('child_process')

var BASE = '/tmp/extract'
var DONE_PATH = BASE + '/done.txt'
var SCRIPT_PATH = BASE + '/package/updatescript.js'
var RUNNING_PATH = BASE + '/running.txt'
var TIMEOUT = 600000

var child = null
var t0 = null
var running = false

var platform = process.argv[2] || 'N7G1'
var model = process.argv[3] || (platform === 'upboard' ? 'gaia' : null)

process.on('SIGUSR2', function () {
  // USR1 is reserved by node
  console.log('Got SIGUSR2. Immune.')
})

setInterval(watch, 1000)
setInterval(function () {
  if (running) return
  process.exit(0)
}, 600000)

function watch () {
  if (running) {
    var interval = Date.now() - t0
    if (interval > TIMEOUT) {
      kill()
    }
    return
  }
  var exists = fs.existsSync(DONE_PATH)
  if (exists) executeScript()
}

function kill () {
  console.log('killing child on timeout')
  if (child) child.kill('SIGINT')
}

function executeScript () {
  // TODO: check sig, and make sure we only run this once to completion
  if (running) return

  var exists = fs.existsSync(SCRIPT_PATH)
  if (!exists) {
    console.error('Script file not present: %s', SCRIPT_PATH)
    return
  }
  var success = start()
  if (!success) {
    console.log("Can't run, there's a new update")
    return
  }
  console.log('in execute')
  child = cp.fork(SCRIPT_PATH, [platform, model])
  child.on('error', function (err) {
    cleanUp()
    console.log(err)
  })
  child.on('exit', function () {
    cleanUp()
    console.log('done')
  })
}

function start () {
  t0 = Date.now()
  running = true
  fs.unlinkSync(DONE_PATH)
  fs.writeFileSync(RUNNING_PATH, 'RUNNING\n')
  return fs.existsSync(RUNNING_PATH)   // check for race conditions
}

function cleanUp () {
  t0 = null
  child = null
  fs.unlinkSync(RUNNING_PATH)
  running = false
}
