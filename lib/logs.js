/** @module logs */

const path = require('path')
const _ = require('lodash/fp')
const nodeFs = require('fs')
const fs = require('pify')(nodeFs)

const dataPath = require('./data-path')
const logsPath = path.resolve(dataPath, 'log')

const DELIMITER_SIZE = 5
const MAX_SIZE = 100000
const MAX_LINES = 2000
const ONE_MB = Math.pow(1024, 2)

/**
 * Get the newest log files
 *
 * Given a timestamp, get the newest log files
 * that are created after timestamp
 *
 * @name getNewestLogFiles
 * @function
 * @async
 *
 * @param {date} timestamp Requested date as unix timestamp
 *
 * @returns {array} Array of log filenames that exceed the timetamp provided
 */
function getNewestLogFiles (timestamp) {
  return fs.readdir(logsPath).then(files => {
    const time = timestamp.slice(0, 10)
    return _.filter(filename => filename.slice(0, 10) >= time && filename.slice(-3) === 'log', files)
  })
}

/**
 * Get the older log files
 *
 * Given a timestamp, get the log files
 * that are created on and before the timestamp
 *
 * @name getOlderLogFiles
 * @function
 * @async
 *
 * @param {date} timestamp Requested date as unix timestamp
 *
 * @returns {array} Array of log filenames that are older than the timetamp provided
 */
function getOlderLogFiles (timestamp) {
  return fs.readdir(logsPath).then(files => {
    const time = timestamp.slice(0, 10)
    return _.filter(filename => {
      return filename.slice(0, 10) <= time || filename.slice(0, 3) === 'old'
    }, files)
  })
}

function removeLogFiles (timestamp) {
  const timestampISO = new Date(timestamp).toISOString()
  return getOlderLogFiles(timestampISO)
    .then(files => {
      return Promise.all(_.map(filename => {
        return fs.unlink(path.resolve(logsPath, filename))
      }, files))
    })
}

const parseAndHandleInvalid = it => {
  const jsonLike = /\{.*\}/g
  const match = jsonLike.exec(it)
  try {
    return JSON.parse(match)
  } catch (e) {
    return null
  }
}

/**
 * Given a timestamp, get the newest log lines that are created
 * after the requested date
 *
 * @name queryNewestLogs
 * @function
 *
 * @param {date} timestamp Requested date as unix timestamp
 *
 * @returns {array} Array of objects (log lines) in ascending order
 */
function queryNewestLogs (_last) {
  const last = _last || {timestamp: new Date(0).toISOString(), serial: 0}
  const filter = log => [log.timestamp, log.serial] > [last.timestamp, last.serial]

  return getNewestLogFiles(last.timestamp)
  // Read log data from log files
    .then(files => {
      return Promise.all(_.map(filename => {
        const filePath = path.resolve(logsPath, filename)
        const rotatedPath = path.resolve(logsPath, `old${filename}`)

        return fs.stat(filePath).then(it => {
          if (it['size'] > ONE_MB) {
            return fs.rename(filePath, rotatedPath).then(() => [])
          }
          return fs.readFile(filePath).then(fileData => fileData.toString().split('\n'))
        })
      }, files))
    })
    .then(_.flatten)
  // Remove empty lines
    .then(_.filter(line => !_.isEmpty(line)))
  // Parse each line
    .then(_.map(parseAndHandleInvalid))
  // Filter possible nulls from the parse
    .then(_.filter(it => it))
  // Filter only logs that are created after the required timestamp
    .then(_.filter(filter))
  // Sort ascending
    .then(_.sortBy(log => ([log.timestamp, log.serial])))
  // Only send last MAX_LINES lines.
  // Ensures syncing is fast at the expensive of possible
  // gaps in server-side log storage.
    .then(_.takeRight(MAX_LINES))
  // Don't send more than MAX_SIZE
  // to avoid any large payload errors
    .then(_.reduce((acc, val) => {
      const size = JSON.stringify(val).length + DELIMITER_SIZE
      return _.concat(acc, {size: _.getOr(0, 'size', _.last(acc)) + size, val})
    }, []))
    .then(_.takeWhile(r => r.size < MAX_SIZE))
    .then(_.map(_.get('val')))
}

module.exports = { removeLogFiles, queryNewestLogs }
