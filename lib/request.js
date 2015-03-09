'use strict'

var P = require('bluebird')
var _ = require('lodash')
var uuid = require('node-uuid')
var Wreck = require('wreck')
var Boom = require('boom')
var wreck = P.promisify(Wreck.request)
var readWreck = P.promisify(Wreck.read)
var Err = require('./error.js')

var RetriableError = Err('RetriableError')
var PollTimeoutError = Err('PollTimeoutError')
var ConnectivityError = Err('ConnectivityError')
var CancelError = Err('CancelError')

// Wreck is cool because all errors map to HTTP status codes
var RETRIABLE_CODES = [408, 409, 412, 500, 502, 503, 504]
var WAITING_CODES = [412]

var cancelVersion = 0

function basicAuthHeader (username, password) {
  return 'Basic ' + new Buffer(username + ':' + password).toString('base64')
}

function makeWreckOpts (opts) {
  var headers = {'request-id': uuid.v4()}
  if (opts.sessionId) {
    headers['session-id'] = opts.sessionId
  }
  if (opts.apiKey) {
    headers.authorization = basicAuthHeader(opts.apiKey, opts.apiSecret)
  }

  return {
    payload: opts.payload && JSON.stringify(opts.payload),
    rejectUnauthorized: true,
    timeout: opts.timeout,
    headers: headers
  }
}

function singleRequest (opts, wreckOpts) {
  var res

  return wreck(opts.method, opts.uri, wreckOpts)
    .then(function (_res) {
      res = _res
      return readWreck(res, {json: true, timeout: opts.timeout})
    })
    .then(function (payload) {
      if (res.statusCode !== 200) { throw Boom.create(res.statusCode) }
      return payload
    })
    .catch(function (err) {
      if (err instanceof P.OperationalError) err = err.cause
      if (!err.isBoom) throw err
      var statusCode = err.output.statusCode
      if (_.contains(RETRIABLE_CODES, statusCode)) {
        throw new RetriableError(err.output.payload, {statusCode: statusCode})
      }
      throw err
    })
}

module.exports = function request (opts) {
  var retryDelay = opts.retryDelay || opts.timeout || 1000
  var t0 = Date.now()
  var pollTimeout = opts.pollTimeout
  var wreckOpts = makeWreckOpts(opts)
  var retries = 0
  var waitingAttempts = 0
  var currentCancel = cancelVersion

  function retriedRequest () {
    return singleRequest(opts, wreckOpts)
      .catch(function (err) {
        if (err instanceof RetriableError) {
          retries++
          if (_.contains(WAITING_CODES, err.statusCode)) { waitingAttempts++ }
          if (pollTimeout && Date.now() - t0 > pollTimeout) {
            if (waitingAttempts / retries > 0.5) {
              throw new PollTimeoutError()
            } else {
              throw new ConnectivityError()
            }
          }
          return P.delay(retryDelay).then(function () {
            if (cancelVersion > currentCancel) throw new CancelError()
            return retriedRequest()
          })
        }
        throw err
      })
  }

  return retriedRequest()
}

// This cancels any requests created in the past.
module.exports.reset = function reset () {
  cancelVersion++
}

module.exports.ConnectivityError = ConnectivityError
module.exports.PollTimeoutError = PollTimeoutError
