'use strict'

var StateMachine = require('./contrib/javascriptstatemachine')
var EventEmitter = require('events').EventEmitter
var util = require('util')

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
    // { name: 'connect', from: 'Refresh', to: 'Disable' },
    // { name: 'refresh', from: 'Start', to: 'Refresh' }, TODO: Is the refresh useful?
    // { name: 'powerUp', from: '*', to: 'PowerUp' },
    // { name: 'powerUpAcceptor', from: '*', to: 'PowerUp' },
    // { name: 'powerUpStacker',
    //   from: ['Stacking', 'VendValid', 'Stacked', 'Paused'],
    //   to: 'PowerUp' },
    { name: 'denominations', from: '*', to: 'Denominations' },
    // { name: 'getEnabled', from: '*', to: 'GetEnabled' },
    { name: 'setEnabled', from: '*', to: 'SetEnabled' },
    // { name: 'initialize', from: '*', to: 'Initialize' },
    { name: 'enable', from: '*', to: 'Enable' },
    { name: 'disable', from: '*', to: 'Disable' },
    { name: 'escrow',
      from: ['Paused', 'Enable', 'Accepting', 'Escrow', 'Idling'],
      to: 'Escrow' },
    // RETURNING, STACKING AND REJECTING ARE NOT REACHABLE FROM THE GET STATUS!
    // { name: 'returning',
    //   from: ['Escrow', 'Returning', 'Paused'],
    //   to: 'Returning' },
    // { name: 'stacking', from: ['Escrow', 'Stacking', 'Paused'], to: 'Stacking' },
    // { name: 'vendValid',
    //   from: ['Connected', 'Escrow', 'Stacking', 'VendValid', 'Paused'],
    //   to: 'VendValid' },
    // { name: 'rejecting',
    //   from: ['Accepting', 'Rejecting', 'Escrow', 'Stacking', 'Paused'],
    //   to: 'Rejecting' },
    { name: 'rejected', from: ['Accepting', 'Escrow', 'Paused'], to: 'Rejected' },
    { name: 'returned', from: ['Accepting', 'Escrow', 'Paused'], to: 'Returned' },
    { name: 'stacked', from: ['Escrow', 'Stacked', 'Paused'], to: 'Stacked' },
    { name: 'idling', from: '*', to: 'Idling' }, // Note: you cant go from Escrow directly to Idling, need to implement that!
    { name: 'stackerOpen', from: '*', to: 'StackerOpen' },
    { name: 'stackerFull',
      from: ['StackerFull', 'Stacked', 'VendValid', 'Paused'],
      to: 'StackerFull' },
    { name: 'accepting',
      from: ['Paused', 'Enable', 'Accepting', 'Idling'],
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

// GenMegaValidatorFsm.prototype.onPowerUp = function () { this.emit('powerUp') }

GenMegaValidatorFsm.prototype.onConnected = function () {
  this.emit('ready')
}

GenMegaValidatorFsm.prototype.onDenominations = function () {
  this.emit('denominations')
}

// GenMegaValidatorFsm.prototype.onGetEnabled = function (event, from, to, data) {
//   this.emit('getEnabled', data)
// }

GenMegaValidatorFsm.prototype.onSetEnabled = function (event, from, to, data) {
  this.emit('setEnabled', data)
}

// GenMegaValidatorFsm.prototype.onEnable = function () {
//   if (this.disableFlag) {
//     console.trace('FSM: delayed disable')
//     this.disableFlag = false
//     this._dispatch('inhibit')
//   }
// }

// GenMegaValidatorFsm.prototype.onleaveDisable = function () {
//   this.disableFlag = false
// }

// GenMegaValidatorFsm.prototype.onDisable = function (event, from) {
//   this.disableFlag = false
//   if (from === 'Initialize') this.emit('standby')
// }

GenMegaValidatorFsm.prototype.onAccepting = function () {
  this.emit('billAccepted')
}

GenMegaValidatorFsm.prototype.onRejected = function (event, from, to, data) {
  this.emit('billRejected', { reason: 'Rejected', code: null })
}

GenMegaValidatorFsm.prototype.onReturned = function () {
  this.emit('billRejected', { reason: 'Returned', code: null })
}

GenMegaValidatorFsm.prototype.onStacked = function () {
  this.emit('billValid')
}

GenMegaValidatorFsm.prototype.onEscrow = function (event, from, to, data) {
  if (from === 'Connected') {
    this.emit('reset')
    return
  }
  this.emit('billRead', data)
}

// GET STATUS IS NOT RETURNING STACKING STATUS, SHOULD WE DEPRECATE IT?
// GenMegaValidatorFsm.prototype.onStacking = function () {
//   this.emit('billValid')
// }
// GenMegaValidatorFsm.prototype.onRejecting = function (event, from, to, data) {
//   this.emit('billRejected', { reason: 'Rejected', code: null })
// }
// GenMegaValidatorFsm.prototype.onReturning = function () {
//   this.emit('billRejected', { reason: 'Returned', code: null })
// }

GenMegaValidatorFsm.prototype.onStackerOpen = function () {
  this.emit('stackerOpen')
}

GenMegaValidatorFsm.prototype.onAcceptorJamm = function () {
  this.emit('stuck')
}

module.exports = GenMegaValidatorFsm
