// for now, make this b/w compat with trader.js calls

const _ = require('lodash/fp')

const got = require('got')
const uuid = require('uuid')
const argv = require('minimist')(process.argv.slice(2))

const PORT = argv.serverPort || 3000
const RETRY_INTERVAL = 5000
const RETRY_TIMEOUT = 60000

function retrier (timeout) {
  const maxRetries = timeout / RETRY_INTERVAL

  return (retry, err) => {
    if (err.statusCode && err.statusCode === 403) return 0
    if (retry >= maxRetries) return 0

    return RETRY_INTERVAL
  }
}

function request (configVersion, globalOptions, options) {
  const protocol = globalOptions.protocol
  const connectionInfo = globalOptions.connectionInfo

  if (!connectionInfo) return Promise.resolve()

  const host = protocol === 'http:' ? 'localhost' : connectionInfo.host
  const requestId = uuid.v4()
  const date = new Date().toISOString()
  const headers = { date, 'request-id': requestId }
  if (options.body && !options.isStream) headers['content-type'] = 'application/json'
  if (configVersion) headers['config-version'] = configVersion
  if (options.isStream) headers['device-id'] = options.deviceId
  const repeatUntilSuccess = !options.noRetry
  const retryTimeout = options.retryTimeout || RETRY_TIMEOUT

  const retries = repeatUntilSuccess
    ? retrier(retryTimeout)
    : null

  const gotOptions = {
    protocol,
    host,
    port: PORT,
    agent: false,
    cert: globalOptions.clientCert.cert,
    key: globalOptions.clientCert.key,
    ca: connectionInfo.ca,
    rejectUnauthorized: true,
    method: options.method,
    path: options.path,
    body: options.body,
    retries,
    timeout: 10000,
    headers,
    json: _.defaultTo(true, !options.isStream)
  }

  return options.isStream ? got.stream(options.path, gotOptions) : got(options.path, gotOptions)
}

module.exports = request
