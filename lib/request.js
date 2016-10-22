// for now, make this b/w compat with trader.js calls

const got = require('got')
const uuid = require('node-uuid')

const PORT = 3000
const RETRY_PERIOD = 60000
const RETRY_INTERVAL = 5000
const MAX_RETRIES = RETRY_PERIOD / RETRY_INTERVAL

function richError (errMessage, name) {
  var err = new Error(errMessage)
  err.name = name
  return err
}

function retrier (retry, err) {
  if (err.statusCode && err.statusCode === 403) return 0
  if (retry >= MAX_RETRIES) return 0

  return RETRY_INTERVAL
}

function request (globalOptions, options, cb) {
  const protocol = globalOptions.protocol || 'https'
  const connectionInfo = globalOptions.connectionInfo
  const host = protocol === 'http' ? 'localhost' : connectionInfo.host
  const requestId = uuid.v4()
  const date = new Date().toISOString()
  const headers = {date, 'request-id': requestId}

  if (options.body) headers['content-type'] = 'application/json'

  const gotOptions = {
    protocol,
    host,
    port: PORT,
    cert: globalOptions.cert,
    key: globalOptions.key,
    rejectUnauthorized: true,
    method: options.method,
    path: options.path,
    body: options.body,
    retries: options.repeatUntilSuccess ? retrier : null,
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
        throw new Error('General HTTP error')
    }
  })
}

module.exports = {request}
