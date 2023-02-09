'use strict'

var StateMachine = require('./contrib/javascriptstatemachine')
var EventEmitter = require('events').EventEmitter
var util = require('util')
var _ = require('lodash')
// var interruptModeDelay = 500

var GenMegaValidatorFsm = function (config) {
  EventEmitter.call(this)
  this.config = config
  this.disableFlag = false
  this.start()
}

util.inherits(GenMegaValidatorFsm, EventEmitter)
GenMegaValidatorFsm.factory = function factory (config) {
  return new GenMegaValidatorFsm(config)
}

StateMachine.create({
  target: GenMegaValidatorFsm.prototype,
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
    // { name: 'powerUp', from: '*', to: 'PowerUp' },
    // { name: 'powerUpAcceptor', from: '*', to: 'PowerUp' },
    // { name: 'powerUpStacker',
    //   from: ['Stacking', 'VendValid', 'Stacked', 'Paused'],
    //   to: 'PowerUp' },
    { name: 'denominations', from: '*', to: 'Denominations' },
    // { name: 'getEnabled', from: '*', to: 'GetEnabled' },
    // { name: 'setEnabled', from: '*', to: 'SetEnabled' },
    { name: 'initialize', from: '*', to: 'Initialize' },
    { name: 'enable', from: '*', to: 'Enable' },
    { name: 'disable', from: '*', to: 'Disable' },
    { name: 'escrow',
      from: ['Paused', 'Enable', 'Accepting', 'Escrow'],
      to: 'Escrow' },
    { name: 'returning',
      from: ['Escrow', 'Returning', 'Paused'],
      to: 'Returning' },
    { name: 'stacking', from: ['Escrow', 'Stacking', 'Paused'], to: 'Stacking' },
    // { name: 'vendValid',
    //   from: ['Connected', 'Escrow', 'Stacking', 'VendValid', 'Paused'],
    //   to: 'VendValid' },
    { name: 'stacked', from: ['VendValid', 'Stacked', 'Paused'], to: 'Stacked' },
    { name: 'idling', from: '*', to: 'Idling' },
    { name: 'rejecting',
      from: ['Accepting', 'Rejecting', 'Escrow', 'Stacking', 'Paused'],
      to: 'Rejecting' },
    { name: 'stackerOpen', from: '*', to: 'StackerOpen' },
    { name: 'stackerFull',
      from: ['StackerFull', 'Stacked', 'VendValid', 'Paused'],
      to: 'StackerFull' },
    { name: 'accepting',
      from: ['Paused', 'Enable', 'Accepting'],
      to: 'Accepting' },
    { name: 'failure', from: '*', to: 'Failure' },
    { name: 'acceptorJam', from: '*', to: 'AcceptorJam' },
    // { name: 'stackerJam', from: '*', to: 'StackerJam' },
    // { name: 'cheated', from: '*', to: 'Cheated' },
    { name: 'pause', from: '*', to: 'Paused' }
  ]
})

// Reset on power up
GenMegaValidatorFsm.prototype.onleavestate = function (event, from, to) {
  clearTimeout(this.stateTimeout)
  console.log('FSM: %s [ %s -> %s ]', event, from, to)
}

GenMegaValidatorFsm.prototype.onPowerUp = function () { this.emit('powerUp') }

GenMegaValidatorFsm.prototype.onleaveConnected = function () {
  this.emit('ready')
}

GenMegaValidatorFsm.prototype.onDenominations = function () {
  this.emit('denominations')
}

// GenMegaValidatorFsm.prototype.onGetEnabled = function (event, from, to, data) {
//   this.emit('getEnabled', data)
// }

// GenMegaValidatorFsm.prototype.onSetEnabled = function (event, from, to, data) {
//   this.emit('setEnabled', data)
// }

GenMegaValidatorFsm.prototype.onEnable = function () {
  if (this.disableFlag) {
    console.trace('FSM: delayed disable')
    this.disableFlag = false
    this._dispatch('inhibit')
  }
}

GenMegaValidatorFsm.prototype.onleaveDisable = function () {
  this.disableFlag = false
}

// GenMegaValidatorFsm.prototype.onenterInitialize = function () {
//   // enable interrupt mode after 500 ms
//   // goal is to prevent interleaved commands conflicts
//   setTimeout(() => {
//     this._dispatch('interruptMode')
//   }, interruptModeDelay)
// }

GenMegaValidatorFsm.prototype.onDisable = function (event, from) {
  this.disableFlag = false
  if (from === 'Initialize') this.emit('standby')
}

GenMegaValidatorFsm.prototype.onAccepting = function () {
  this.emit('billAccepted')
}

GenMegaValidatorFsm.prototype.onRejecting = function (event, from, to, data) {
  console.log('Rejected bill: %s', data.reason)
  this.emit('billRejected', data)
}

GenMegaValidatorFsm.prototype.onReturning = function () {
  this.emit('billRejected', { reason: 'Returned', code: null })
}

GenMegaValidatorFsm.prototype.onReturning = function () {
  this.emit('billRejected', { reason: 'Returned', code: null })
}

GenMegaValidatorFsm.prototype.onEscrow = function (event, from, to, data) {
  this.emit('billRead', data)
}

// GenMegaValidatorFsm.prototype.onVendValid = function (event, from) {
//   // TODO: handle this better
//   if (from === 'Connected') {
//     this._dispatch('reset')
//     return
//   }
//   // this._dispatch('ack')
//   this.emit('billValid')
// }

GenMegaValidatorFsm.prototype.onStackerOpen = function () {
  this.emit('stackerOpen')
}

// GenMegaValidatorFsm.prototype._dispatch = function (cmd) {
//   this.emit('dispatch', cmd)
// }

module.exports = GenMegaValidatorFsm
