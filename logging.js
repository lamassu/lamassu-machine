const path = require('path')
const clim = require('clim')
const fs = require('fs')
const uuid = require('uuid')

const dataPath = require('./lib/data-path')

let lastTimestamp = null
let serial = 0

clim.getTime = function () {
  return new Date().toISOString()
}

// WARNING: This method has side effects
function getSerial (timestamp) {
  if (lastTimestamp === timestamp) {
    return ++serial
  }

  lastTimestamp = timestamp
  serial = 0
  return serial
}

function diskLog (level, timestamp, msg) {
  const line = JSON.stringify({
    id: uuid.v4(),
    timestamp,
    serial: getSerial(timestamp),
    level,
    msg
  }) + '\n'
  fs.appendFile(getLogFile(), line, () => {})
}

clim.logWrite = function (level, prefixes, msg) {
  const timestamp = clim.getTime()
  diskLog(level, timestamp, msg)
  var line = timestamp + ' ' + level
  if (prefixes.length > 0) line += ' ' + prefixes.join(' ')
  line += ' ' + msg
  process.stderr.write(line + '\n')
}

/**
 * Get file by current date
 *
 * Returns a file name (full path)
 * ending on current ymd in format yy-mm-dd
 *
 * @name getLogFile
 * @function
 *
 * @returns {string} Log file path ending in yy-mm-dd format
 */
function getLogFile () {
  const ymd = new Date().toISOString().slice(0, 10)
  return path.resolve(dataPath, 'log', `${ymd}.log`)
}

fs.mkdir(path.resolve(dataPath, 'log'), () => {})
clim(console, true)
