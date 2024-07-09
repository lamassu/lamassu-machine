const EventEmitter = require('events').EventEmitter
const util = require('util')
const BNR = require('@lamassu/bnr-advance')
const _ = require('lodash/fp')

const denominationsTable = require('./denominations')
const BN = require('../bn')

const BnrAdvance = function () {
  EventEmitter.call(this)
  this.fiatCode = null
  this.bnrEmitter = null
}

util.inherits(BnrAdvance, EventEmitter)

BnrAdvance.factory = function factory (config) {
  return new BnrAdvance(config)
}

BnrAdvance.prototype.setFiatCode = function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
}

BnrAdvance.prototype.enable = function enable () {
  return BNR.acceptBill(this.fiatCode, this.bnrEmitter)
    .then(billInserted => {
      if (!billInserted || billInserted <= 0) {
        console.error('No bill inserted, amount equals =>', billInserted)
        return
      }

      this.emit('billsAccepted')
      return process.nextTick(() => this.emit('billsRead', { denomination: billInserted }))
    })
    .catch(err => {
      console.error('Error enabling cash acceptance:', err)
      throw err
    })
}

BnrAdvance.prototype.disable = function disable () {
  return BNR.disable(this.bnrEmitter)
    .catch(err => {
      // don't throw error if cashInEnd fails on disable
    })
}

BnrAdvance.prototype.reject = function reject () {
  return BNR.rollback(this.bnrEmitter)
    .then(() => this.emit('billsRejected'))
    .catch(err => {
      console.error('Error rejecting bill:', err)
      throw err
    })
}

BnrAdvance.prototype.stack = function stack () {
  return BNR.cashInEnd(this.bnrEmitter)
    .then(() => {
      this.emit('billsValid')
      this.enable()
    })
    .catch(err => {
      console.error('Error stacking bill:', err)
      throw err
    })
}

BnrAdvance.prototype.run = function run (cb) {
  return BNR.performStartup()
    .then(emitter => {
      console.log('BNR is ready')
      this.bnrEmitter = emitter
    })
    .catch(err => {
      console.error('Error initializing BNR:', err)
      cb(err)
    })
}

BnrAdvance.prototype._denominations = function _denominations () {
  return denominationsTable[this.fiatCode]
}

BnrAdvance.prototype.hasDenominations = function hasDenominations () {
  return this.bnrEmitter && !!this._denominations()
}

BnrAdvance.prototype.lowestBill = function lowestBill (fiat) {
  var bills = this._denominations()
  const filtered = bills.filter(bill => fiat.lte(bill))
  if (_.isEmpty(filtered)) return BN(_.min(bills))
  return BN(_.min(filtered))
}

BnrAdvance.prototype.highestBill = function highestBill (fiat) {
  var bills = this._denominations()
  var filtered = _.filter(bill => fiat.gte(bill), bills)
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
}


BnrAdvance.prototype.lightOn = function lightOn () {
}

BnrAdvance.prototype.lightOff = function lightOff () {
}

BnrAdvance.prototype.monitorHeartbeat = function monitorHeartbeat () {
}

module.exports = BnrAdvance