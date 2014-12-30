'use strict';

var P = require('bluebird');
var _ = require('lodash');
var uuid = require('node-uuid');
var Wreck = require('wreck');
var Boom = require('boom');
var wreck = P.promisify(Wreck.request);
var readWreck = P.promisify(Wreck.read);
var Err = require('./error.js');

var RetriableError = Err('RetriableError');
var PollTimeoutError = Err('PollTimeoutError');

// Wreck is cool because all errors map to HTTP status codes
var CONNECTIVITY_CODES = [408, 412, 502, 503, 504];

var sessionId;

function basicAuthHeader(username, password) {
  return 'Basic ' + new Buffer(username + ':' + password).toString('base64');
}

function makeWreckOpts(opts) {
  var headers = {'request-id': uuid.v4()};
  if (sessionId) {
    headers['session-id'] = sessionId;
  }
  if (opts.apiKey) {
    headers.authorization = basicAuthHeader(opts.apiKey, opts.apiSecret);
  }

  return {
    payload: opts.payload,
    rejectUnauthorized: true,
    timeout: opts.timeout,
    headers: headers
  };
}

function singleRequest(opts, wreckOpts) {
  var res;

  console.log('DEBUG1');

  return wreck(opts.method, opts.uri, wreckOpts)
  .then(function(_res) {
    res = _res;
    return readWreck(res, {json: true, timeout: opts.timeout});
  }).then(function(payload) {
    if (res.statusCode !== 200) { throw Boom.create(res.statusCode); }
    return payload;
  }).error(function(err) {
    var statusCode = err.cause.output.statusCode;
    if (_.contains(CONNECTIVITY_CODES, statusCode)) {
      throw new RetriableError();
    }
    throw err;
  });
}

exports.setSessionId = function(_sessionId) {
  sessionId = _sessionId;
};

exports.request = function request(opts) {
  var retryDelay = opts.retryDelay || opts.timeout || 1000;
  var t0 = Date.now();
  var pollTimeout = opts.pollTimeout;
  var wreckOpts = makeWreckOpts(opts);

  function retriedRequest() {
    return singleRequest(opts, wreckOpts)
    .catch(function(err) {
      if (err instanceof RetriableError) {
        if (pollTimeout && Date.now() - t0 > pollTimeout) {
          throw new PollTimeoutError();
        }
        return P.delay(retryDelay).then(function() {
          return retriedRequest(opts);
        });
      }
      throw err;
    });
  }

  return retriedRequest();
};
