const path = require('path')
const clim = require('clim')
const fs = require('fs')
const uuid = require('uuid')

const dataPath = require('./lib/data-path')

const LOG_FILE = path.resolve(dataPath, 'machine.log')

clim.getTime = function () {
  return new Date().toISOString()
}

function diskLog (level, timestamp, msg) {
  const line = JSON.stringify({
    id: uuid.v4(),
    timestamp,
    level,
    msg
  }) + '\n'
  fs.appendFile(LOG_FILE, line, () => {})
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

clim(console, true)
