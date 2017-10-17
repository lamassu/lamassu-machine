/** @module logs */

const path = require('path')
const _ = require('lodash/fp')
const nodeFs = require('fs')
const fs = require('pify')(nodeFs)

const dataPath = require('./data-path')
const logsPath = path.resolve(path, dataPath, 'log')

const MAX_LOGS_PER_REQUEST = 100

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
 * @param {date} timetamp Requested date as unix timestamp
 *
 * @returns {array} Array of log filenames that exceed the timetamp provided
 */
function getNewestLogFiles (timestamp) {
  return fs.readdir(logsPath).then(files => {
    const time = timestamp.slice(0, 10)
    return _.filter(filename => filename.slice(0, 10) >= time, files)
  })
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
function queryNewestLogs (timestamp) {
  return getNewestLogFiles(timestamp)
  // Read log data from log files
  .then(files => {
    return Promise.all(_.map(filename => {
      return fs.readFile(path.resolve(logsPath, filename))
      .then(fileData => fileData.toString().split('\n'))
    }, files))
  })
  .then(_.flatten)
  // Remove empty lines
  .then(_.filter(line => !_.isEmpty(line)))
  // Parse each line
  .then(_.map(JSON.parse))
  // Filter only logs that are created after the required timestamp
  .then(_.filter(log => log.timestamp >= timestamp))
  // Sort ascending
  .then(_.sortBy(log => log.timestamp))
  // Don't send more than MAX_LOGS_PER_REQUEST
  // to avoid any large payload errors
  .then(_.slice(0, MAX_LOGS_PER_REQUEST))
}

module.exports = { queryNewestLogs }
