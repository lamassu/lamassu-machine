'use strict';

var url = require('url');
var request = require('./request');
var sessionId = null;

var HOST = process.env.NODE_ENV === 'development' ?
  'http://localhost:8085' :
  'https://api.lamassu.is';

exports.reset = function reset(_sessionId) {
  sessionId = _sessionId;
};

exports.registerPhone = function registerPhone(number, cb) {
  var uri = url.resolve(HOST, '/zero_conf/phone/' + encodeURIComponent(number));
  var opts = {
    method: 'POST',
    sessionId: sessionId,
    uri: uri,
    timeout: 1000,
    retries: 60,
    retryDelay: 1000
  };
  return request(opts).nodeify(cb);
};
