'use strict'

// This module represents browser events, to abstract away protocol.
// TODO: in general, how do we handle browser.send errors?

var EventEmitter = require('events').EventEmitter
var util = require('util')

var WebSocketServer = require('ws').Server

var CONNECTION_ERROR_LOG_RATE = 1000 * 60 * 60

var Browser = function () {
  if (!(this instanceof Browser)) return new Browser()
  EventEmitter.call(this)
  this.wss = null
  this.ws = null
  this.lastConnectionErrorLog = null
}

util.inherits(Browser, EventEmitter)

Browser.prototype.listen = function listen (port) {
  console.log('Listening on websocket port %d', port)
  this.wss = new WebSocketServer({port, host: '127.0.0.1'})

  var self = this
  this.wss.on('connection', function (ws) {
    self.ws = ws

    ws.on('message', function (data) {
      var res = JSON.parse(data)
      self.emit('message', res)
    })
    self.lastConnectionErrorLog = null
    self.emit('connected')
  })
  this.wss.on('close', function () {
    self.emit('closed')
  })
  this.wss.on('error', function (err) {
    self.emit('error', err)
  })
}

Browser.prototype.isConnected = function isConnected () {
  return !!this.ws
}

Browser.prototype.send = function send (req) {
  if (!this.ws) {
    var elapsed = this.lastConnectionErrorLog === null ||
      Date.now() - this.lastConnectionErrorLog > CONNECTION_ERROR_LOG_RATE
    if (elapsed) {
      console.log('browser not connected')
      this.lastConnectionErrorLog = Date.now()
    }
    return
  }

  var self = this
  var message = JSON.stringify(req)
  this.ws.send(message, function (err) {
    if (err) {
      var elapsed = self.lastConnectionErrorLog === null ||
        Date.now() - self.lastConnectionErrorLog > CONNECTION_ERROR_LOG_RATE
      if (elapsed) {
        self.lastConnectionErrorLog = Date.now()
        self.emit('messageError', err)
      }
    } else {
      self.emit('messageSent')
    }
  })
}

module.exports = Browser
