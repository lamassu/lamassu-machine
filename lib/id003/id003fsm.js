'use strict'

var StateMachine = require('./contrib/javascriptstatemachine')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var _ = require('lodash')

var Id003Fsm = function (config) {
  EventEmitter.call(this)
  this.config = config
  this.disableFlag = false
  this.start()
}

util.inherits(Id003Fsm, EventEmitter)
Id003Fsm.factory = function factory (config) {
  return new Id003Fsm(config)
}

StateMachine.create({
  target: Id003Fsm.prototype,
  error: function (eventName, from, to, args, errorCode, errorMessage, err) {
    if (err) this.emit('error', err)
    else console.log('FSM: %s', errorMessage)
  },
  events: [
    { name: 'start', from: ['none', 'Failure'], to: 'Start' },
    { name: 'badFrame', from: '*', to: 'BadFrame' },
    { name: 'connect', from: 'Start', to: 'Connected' },
    { name: 'connect', from: 'Refresh', to: 'Disable' },
    { name: 'refresh', from: 'Start', to: 'Refresh' },
    { name: 'powerUp', from: '*', to: 'PowerUp' },
    { name: 'powerUpAcceptor',
      from: ['Accepting', 'Escrow', 'Stacking', 'Paused'],
      to: 'PowerUp' },
    { name: 'powerUpStacker',
      from: ['Stacking', 'VendValid', 'Stacked', 'Paused'],
      to: 'PowerUp' },
    { name: 'denominations', from: '*', to: 'Denominations' },
    { name: 'getEnabled', from: '*', to: 'GetEnabled' },
    { name: 'setEnabled', from: '*', to: 'SetEnabled' },
    { name: 'initialize', from: '*', to: 'Initialize' },
    { name: 'enable', from: '*', to: 'Enable' },
    { name: 'disable', from: '*', to: 'Disable' },
    { name: 'escrow', from: ['Paused', 'Enable', 'Accepting', 'Escrow'],
      to: 'Escrow' },
    { name: 'returning', from: ['Escrow', 'Returning', 'Paused'],
      to: 'Returning' },
    { name: 'stacking', from: ['Escrow', 'Stacking', 'Paused'], to: 'Stacking' },
    { name: 'vendValid',
      from: ['Connected', 'Escrow', 'Stacking', 'VendValid', 'Paused'],
      to: 'VendValid' },
    { name: 'stacked', from: ['VendValid', 'Stacked', 'Paused'], to: 'Stacked' },
    { name: 'rejecting',
      from: ['Accepting', 'Rejecting', 'Escrow', 'Stacking', 'Paused'],
      to: 'Rejecting' },
    { name: 'stackerOpen', from: '*', to: 'StackerOpen' },
    { name: 'stackerFull',
      from: ['StackerFull', 'Stacked', 'VendValid', 'Paused'],
      to: 'StackerFull' },
    { name: 'accepting', from: ['Paused', 'Enable', 'Accepting'],
      to: 'Accepting' },
    { name: 'failure', from: '*', to: 'Failure' },
    { name: 'acceptorJam', from: '*', to: 'AcceptorJam' },
    { name: 'stackerJam', from: '*', to: 'StackerJam' },
    { name: 'cheated', from: '*', to: 'Cheated' },
    { name: 'pause', from: '*', to: 'Paused' }
  ]
})

var TRANSIENT = ['returning', 'stacking', 'stacked', 'accepting', 'rejecting']

// Reset on power up
Id003Fsm.prototype.onleavestate = function (event, from, to) {
  clearTimeout(this.stateTimeout)
  console.log('FSM: %s [ %s -> %s ]', event, from, to)
}

// TODO FIX this will never do anything, as it stands. Check for transient event,
// or change TRANSIENT to states, not events.
Id003Fsm.prototype.onenterstate = function (event, from, to) {
  if (!_.includes(to, TRANSIENT)) return
  var self = this
  this.stateTimeout = setTimeout(function () {
    self.emit('stuck')
  }, this.config.transientTimeout)
}

Id003Fsm.prototype.onPowerUp = function () { this.emit('powerUp') }

Id003Fsm.prototype.onleaveConnected = function () {
  this.emit('ready')
}

Id003Fsm.prototype.onDenominations = function () {
  this.emit('denominations')
}

Id003Fsm.prototype.onGetEnabled = function (event, from, to, data) {
  this.emit('getEnabled', data)
}

Id003Fsm.prototype.onSetEnabled = function (event, from, to, data) {
  this.emit('setEnabled', data)
}

Id003Fsm.prototype.onEnable = function () {
  if (this.disableFlag) {
    console.trace('FSM: delayed disable')
    this.disableFlag = false
    this._dispatch('inhibit')
  }
}

Id003Fsm.prototype.onleaveDisable = function () {
  this.disableFlag = false
}

Id003Fsm.prototype.onenterInitialize = function () {
  this._dispatch('interruptMode')
}

Id003Fsm.prototype.onDisable = function (event, from) {
  this.disableFlag = false
  if (from === 'Initialize') this.emit('standby')
}

Id003Fsm.prototype.onAccepting = function () {
  this.emit('billAccepted')
}

Id003Fsm.prototype.onRejecting = function (event, from, to, data) {
  console.log('Rejected bill: %s', data.reason)
  this.emit('billRejected', data)
}

Id003Fsm.prototype.onReturning = function () {
  this.emit('billRejected', {reason: 'Returned', code: null})
}

Id003Fsm.prototype.onEscrow = function (event, from, to, data) {
  this.emit('billRead', data)
}

Id003Fsm.prototype.onVendValid = function (event, from) {
  // TODO: handle this better
  if (from === 'Connected') {
    this._dispatch('reset')
    return
  }
  this._dispatch('ack')
  this.emit('billValid')
}

Id003Fsm.prototype.onStackerOpen = function () {
  this.emit('stackerOpen')
}

Id003Fsm.prototype._dispatch = function (cmd) {
  this.emit('dispatch', cmd)
}

module.exports = Id003Fsm
