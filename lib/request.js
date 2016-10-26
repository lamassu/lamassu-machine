// for now, make this b/w compat with trader.js calls

const got = require('got')
const uuid = require('node-uuid')

const PORT = 3000
const RETRY_INTERVAL = 5000
const RETRY_TIMEOUT = 60000

function richError (errMessage, name) {
  var err = new Error(errMessage)
  err.name = name
  return err
}

function retrier (timeout) {
  const maxRetries = timeout / RETRY_INTERVAL

  return (retry, err) => {
    if (err.statusCode && err.statusCode === 403) return 0
    if (retry >= maxRetries) return 0

    console.log('DEBUG222')
    return RETRY_INTERVAL
  }
}

function request (globalOptions, options, cb) {
  const protocol = globalOptions.protocol
  const connectionInfo = globalOptions.connectionInfo

  if (!connectionInfo) return cb()

  const host = protocol === 'http:' ? 'localhost' : connectionInfo.host
  const requestId = uuid.v4()
  const date = new Date().toISOString()
  const headers = {date, 'request-id': requestId}

  if (options.body) headers['content-type'] = 'application/json'

  const retryTimeout = options.retryTimeout || RETRY_TIMEOUT

  const retries = options.repeatUntilSuccess || options.retryTimeout
  ? retrier(retryTimeout)
  : null

  const gotOptions = {
    protocol,
    host,
    port: PORT,
    agent: false,
    cert: globalOptions.clientCert.cert,
    key: globalOptions.clientCert.key,
    ca: globalOptions.ca,
    rejectUnauthorized: true,
    method: options.method,
    path: options.path,
    body: options.body && JSON.stringify(options.body),
    retries,
    headers,
    json: true
  }

  return got(options.path, gotOptions)
  .catch(err => {
    switch (err) {
      case got.RequestError:
      case got.ReadError:
      case got.ParseError:
        throw richError(err.message, 'networkDown')
      case got.HTTPError:
        throw richError('HTTP error code: ' + err.statusCode, 'statusError')
      default:
        throw err
    }
  })
  .then(r => cb(null, r.body))
  .catch(err => cb(err))
}

module.exports = {request}
