var url = require('url')
var _ = require('lodash')
var minimist = require('minimist')
var _request = require('./request')
var sessionId = null
var config

var commandLine = minimist(process.argv.slice(2))
var staging = commandLine.staging

var HOST = staging ?
  'http://api1.raqia.is' :
  'https://api.raqia.is'

if (process.env.NODE_ENV === 'development') HOST = 'http://localhost:3100'

exports.ConnectivityError = _request.ConnectivityError
exports.PollTimeoutError = _request.PollTimeoutError

exports.reset = function reset (_sessionId) {
  _request.reset()
  sessionId = _sessionId
}

exports.configure = function configure (_config) {
  config = _config
}

exports.hasConfig = function hasConfig () {
  return !!config
}

function request (uri, method, specialOpts, cb) {
  var originalSessionId = sessionId
  var params = opts(uri, method, specialOpts)

  _request(params)
    .then(function (res) {
      if (sessionId !== originalSessionId) return
      cb(null, res)
    })
    .catch(function (err) {
      if (sessionId !== originalSessionId) return
      cb(err)
    })
}

function opts (uri, method, specialOpts) {
  return _.merge({
    method: method,
    uri: uri,
    timeout: 5000,
    pollTimeout: 10000,
    retryDelay: 1000,
    sessionId: sessionId,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret
  }, specialOpts)
}

exports.phoneCode = function phoneCode (number, cb) {
  var uri = url.resolve(HOST, '/zero_conf/phone_code/' +
    encodeURIComponent(number))
  return request(uri, 'POST', null, cb)
}

exports.registerTx = function registerTx (tx, cb) {
  var uri = url.resolve(HOST, '/zero_conf/session/' + sessionId)
  return request(uri, 'PUT', {payload: {tx: tx}}, cb)
}

exports.updatePhone = function updatePhone (phone, cb) {
  var uri = url.resolve(HOST, '/zero_conf/session/' + sessionId)
  var data = {tx: {phone: phone}}
  return request(uri, 'PATCH', {payload: data, pollTimeout: 60000}, cb)
}

exports.fetchPhoneTx = function fetchPhoneTx (number, cb) {
  var uri = url.resolve(HOST, '/zero_conf/sessions?phone=' +
    encodeURIComponent(number))
  return request(uri, 'GET', null, cb)
}

exports.waitForDispense = function waitForDispense (status, cb) {
  var urlPath = '/zero_conf/session/' + sessionId + '?not_status=' + status
  var uri = url.resolve(HOST, urlPath)
  var specialOpts = {pollTimeout: 90000, retryDelay: 500}
  return request(uri, 'GET', specialOpts, cb)
}

exports.dispense = function dispense (_sessionId, cb) {
  var uri = url.resolve(HOST, '/zero_conf/dispense/' + _sessionId)
  return request(uri, 'POST', null, cb)
}
