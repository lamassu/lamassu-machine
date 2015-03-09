'use strict'

var cp = require('child_process')
var util = require('util')
var EventEmitter = require('events').EventEmitter

var WpaCli = function (config) {
  EventEmitter.call(this)
  this.config = config
}
util.inherits(WpaCli, EventEmitter)
WpaCli.factory = function factory (config) {
  return new WpaCli(config)
}

WpaCli.prototype.command = function command (args, cb) {
  if (!util.isArray(args)) args = [args]
  var socket = this.config.socket
  if (socket) args.unshift('-p', socket)
  cp.execFile('wpa_cli', args, cb)
}

module.exports = WpaCli
