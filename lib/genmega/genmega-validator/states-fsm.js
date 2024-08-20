'use strict'

var StateMachine = require('./contrib/javascriptstatemachine')
var EventEmitter = require('events').EventEmitter
var util = require('util')

var GenMegaValidatorFsm = function () {
  EventEmitter.call(this)
  this.start()
}

util.inherits(GenMegaValidatorFsm, EventEmitter)
GenMegaValidatorFsm.factory = function factory () {
  return new GenMegaValidatorFsm()
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
    { name: 'stacking', from: ['Escrow', 'Stacking', 'Paused'], to: 'Stacking' },
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

// GenMegaValidatorFsm.prototype.onGetEnabled = function (event, from, to, data) {
//   this.emit('getEnabled', data)
// }

GenMegaValidatorFsm.prototype.onAccepting = function () {
  this.emit('billsAccepted')
}

GenMegaValidatorFsm.prototype.onStacked = function () {
  this.emit('billsValid')
}

// GET STATUS IS NOT RETURNING STACKING STATUS, SHOULD WE DEPRECATE IT?
// GenMegaValidatorFsm.prototype.onStacking = function () {
//   this.emit('billsValid')
// }

GenMegaValidatorFsm.prototype.onStackerOpen = function () {
  this.emit('stackerOpen')
}

GenMegaValidatorFsm.prototype.onAcceptorJamm = function () {
  this.emit('stuck')
}

module.exports = GenMegaValidatorFsm
