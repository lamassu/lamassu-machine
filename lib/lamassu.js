'use strict';

var url = require('url');
var P = require('bluebird');
var _ = require('lodash');
var Wreck = require('wreck');
var wreck = P.promisify(Wreck.request);
var readWreck = P.promisify(Wreck.read);
var Err = require('./error.js');

var ConnectivityError = Err('ConnectivityError');
var MaxRetryError = Err('MaxRetryError');

// Wreck is cool because all errors map to HTTP status codes
var CONNECTIVITY_CODES = [408, 502, 503, 504];

var RETRY_DELAY = 500;

var HOST = _.contains(['test', 'development'], process.env.NODE_ENV) ?
  'http://localhost:8085' :
  'https://api.lamassu.is';

function singleRequest(opts) {
  var localOpts = {
    payload: opts.payload,
    rejectUnauthorized: true,
    timeout: 5000
  };

  var uri = url.resolve(HOST, opts.path);

  return wreck(opts.method, uri, localOpts)
  .then(function(res) {
    return readWreck(res, {json: true, timeout: 5000});
  }).error(function(err) {
    console.log(typeof(err));
    var statusCode = err.cause.output.statusCode;
    if (_.contains(CONNECTIVITY_CODES, statusCode)) {
      throw new ConnectivityError();
    }
    throw err;
  });
}

function request(opts) {
  var retries = 0;
  var maxRetries = opts.retries;

  function retriedRequest(opts) {
    return singleRequest(opts)
    .catch(ConnectivityError, function() {
      if (maxRetries && retries++ >= maxRetries) throw new MaxRetryError();
      return P.delay(RETRY_DELAY).then(function() {
        return retriedRequest(opts);
      });
    });
  }

  return retriedRequest(opts);
}

request({
  method: 'GET',
  path: '/',
  payload: ''
})
.then(function(res) {
  console.log(res);
});
