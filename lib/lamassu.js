'use strict';

var url = require('url');
var request = require('./request');
var sessionId = null;
var config;

var HOST = process.env.NODE_ENV === 'development' ?
  'http://localhost:8085' :
  'https://api.lamassu.is';

exports.reset = function reset(_sessionId) {
  sessionId = _sessionId;
};

exports.configure = function configure(_config) {
  config = _config;
};

function opts(uri, method, payload) {
  return {
    method: method,
    sessionId: sessionId,
    uri: uri,
    payload: payload || null,
    timeout: 5000,
    retries: 10,
    retryDelay: 1000,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret
  };
}

exports.phoneCode = function phoneCode(number, cb) {
  var uri = url.resolve(HOST, '/zero_conf/phone_code/' + encodeURIComponent(number));
  return request(opts(uri, 'POST')).nodeify(cb);
};

exports.registerPhoneTx = function registerPhoneTx(number, tx, cb) {
  var uri = url.resolve(HOST, '/zero_conf/phone_tx/' + encodeURIComponent(number));
  return request(opts(uri, 'POST', tx)).nodeify(cb);
};

exports.fetchPhoneTx = function fetchPhoneTx(number, cb) {
  var uri = url.resolve(HOST, '/zero_conf/phone_tx/' + encodeURIComponent(number));
  return request(opts(uri, 'GET')).nodeify(cb);
};

exports.dispense = function dispense(number, sessionId, cb) {
  var uri = url.resolve(HOST, '/zero_conf/phone_tx/' +
    encodeURIComponent(number) + '/' + encodeURIComponent(sessionId));
  return request(opts(uri, 'POST')).nodeify(cb);
};

