const process = require('process')
const EventEmitter = require('events').EventEmitter
const util = require('util')
const net = require('net')

const _ = require('lodash/fp')

const BN = require('../bn')

const Id003 = function (config) {
  EventEmitter.call(this)
  this.initialized = false
  this.pollingInterval = null
  this.config = config
  this.denominations = {
    1: 1, 5: 5, 10: 10, 20: 20, 50: 50, 100: 100
  }
}

util.inherits(Id003, EventEmitter)

Id003.factory = function factory (config) {
  return new Id003(config)
}

const functions = {
  setFiatCode,
  lightOn,
  lightOff,
  run,
  isCashboxOut,
  close,
  refresh,
  enable,
  disable,
  stack,
  reject,
  lowestBill,
  highestBill,
  hasDenominations
}

function lightOn () {
  console.log('mock id003: lightOn')
}

function lightOff () {
  console.log('mock id003: lightOff')
}

function setFiatCode (fiatCode) {
  this.fiatCode = fiatCode
}

function handleCommand (msg) {
  const denomination = msg.denomination && BN(msg.denomination)
  switch (msg.command) {
    case 'insertBill':
      this.emit('billInserted')
      this.emit('billRead', {denomination})
      break
    default:
      throw new Error(`No such command: ${msg.command}`)
  }
}

function run (cb) {
  const handler = handleCommand.bind(this)
  process.on('message', handler)

  const server = net.createServer(socket => {
    socket.on('data', (data) => handler(JSON.parse(data)))
  })
    .on('error', err => {
      console.log(err)
    })

  server.listen({port: 3077}, (err, res) => {
    if (err) throw err
    console.log('Bills server listening on port 3077')
  })

  cb()
}

function isCashboxOut () {
  return false
}

function close (cb) {
  cb()
}

function refresh (cb) {
  cb()
}

function enable () {
}

function disable () {
}

function stack () {
  this.emit('billValid')
}

function reject () {
  this.emit('billRejected')
}

function lowestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.lte(bill))
  if (_.isEmpty(filtered)) return BN(Infinity)
  return BN(_.min(filtered))
}

function highestBill (fiat) {
  const bills = _.values(this.denominations)
  const filtered = bills.filter(bill => fiat.gte(bill))
  if (_.isEmpty(filtered)) return BN(-Infinity)
  return BN(_.max(filtered))
}

function hasDenominations () {
  return this.denominations !== null
}

Id003.prototype = _.merge(Id003.prototype, functions)

module.exports = Id003
