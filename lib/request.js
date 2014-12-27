'use strict';

var P = require('bluebird');
var _ = require('lodash');
var uuid = require('node-uuid');
var Wreck = require('wreck');
var Boom = require('boom');
var wreck = P.promisify(Wreck.request);
var readWreck = P.promisify(Wreck.read);
var Err = require('./error.js');

var ConnectivityError = Err('ConnectivityError');
var MaxRetryError = Err('MaxRetryError');

// Wreck is cool because all errors map to HTTP status codes
var CONNECTIVITY_CODES = [408, 502, 503, 504];

function singleRequest(requestId, opts) {
  var localOpts = {
    payload: opts.payload,
    rejectUnauthorized: true,
    timeout: opts.timeout,
    headers: {
      'request-id': requestId,
      'session-id': opts.sessionId
    }
  };

  var res;

  return wreck(opts.method, opts.uri, localOpts)
  .then(function(_res) {
    res = _res;
    return readWreck(res, {json: true, timeout: 5000});
  }).then(function(payload) {
    if (res.statusCode !== 200) throw Boom.create(res.statusCode);
    return payload;
  }).error(function(err) {
    var statusCode = err.cause.output.statusCode;
    if (_.contains(CONNECTIVITY_CODES, statusCode)) {
      throw new ConnectivityError();
    }
    throw err;
  });
}

exports.request = function request(opts) {
  var retries = 0;
  var maxRetries = opts.retries;
  var retryDelay = opts.retryDelay || opts.timeout || 1000;
  var requestId = uuid.v4();

  function retriedRequest(opts) {
    return singleRequest(requestId, opts)
    .catch(ConnectivityError, function() {
      if (maxRetries && retries++ >= maxRetries) throw new MaxRetryError();
      return P.delay(retryDelay).then(function() {
        return retriedRequest(opts);
      });
    });
  }

  return retriedRequest(opts);
};
