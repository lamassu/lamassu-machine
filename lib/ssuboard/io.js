const actionEmitter = require('../action-emitter')
const fs = require('fs')

const pify = require('pify')
const _ = require('lodash/fp')

const readFile = pify(fs.readFile)
const writeFile = pify(fs.writeFile)
const accessFile = pify(fs.access)

const OUTPUTS = {
  door: 248,
  siren: 249
}

const INPUTS = {
  doorLock: 166,
  doorLatch: 132,
  battPower: 50
}

const POLL_INTERVAL = 100

module.exports = {setup, run}

function setupOutput (_address) {
  const address = _address.toString()

  const exportPath = `/sys/class/gpio/gpio${address}`

  return accessFile(exportPath)
  .catch(() => {
    // Only do this if exportPath doesn't exist
    return writeFile('/sys/class/gpio/export', address.toString())
    .then(() => writeFile(`/sys/class/gpio/gpio${address}/direction`, 'out'))
  })
}

function setupInput (_address) {
  const address = _address.toString()

  const exportPath = `/sys/class/gpio/gpio${address}`

  return accessFile(exportPath)
  .catch(() => {
    // Only do this if exportPath doesn't exist
    return writeFile('/sys/class/gpio/export', address.toString())
    .then(() => writeFile(`/sys/class/gpio/gpio${address}/direction`, 'in'))
  })
}

function setupInputs () {
  const addresses = _.values(INPUTS)
  return Promise.all(_.map(setupInput, addresses))
}

function setupOutputs () {
  const addresses = _.values(OUTPUTS)
  return Promise.all(_.map(setupOutput, addresses))
}

function setup () {
  return Promise.all([setupInputs, setupOutputs])
}

function writeValue (address, value) {
  console.log(`/sys/class/gpio/gpio${address}/value`)
  console.log(value.toString())
  return writeFile(`/sys/class/gpio/gpio${address}/value`, value.toString())
}

function openDoor () {
  return writeValue(OUTPUTS.door, 1)
  .then(() => delay(2000))
  .then(() => writeValue(OUTPUTS.door, 0))
}

function readBoolValue (address) {
  return readFile(`/sys/class/gpio/gpio${address}/value`)
  .then(r => parseInt(r.toString(), 10) === 1)
}

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

let doorOpened = false
let doorLocked = false
let battPowered = true

function emit (code, action) {
  actionEmitter.emit(code, {action})
}

function poll () {
  return Promise.all(_.map(readBoolValue, INPUTS))
  .then(([doorLock, doorOpen, battPower]) => {
    if (doorLock !== doorLocked) emit('door', doorLock ? 'doorLocked' : 'doorUnlocked')
    if (doorOpen !== doorOpened) emit('door', doorOpen ? 'doorClosed' : 'doorOpened')
    if (battPower !== battPowered) emit('battery', battPower ? 'battPower' : 'mainsPower')

    doorOpened = doorOpen
    doorLocked = doorLock
    battPowered = battPower
  })
}

function processDoorManager (event) {
  switch (event.action) {
    case 'popDoor':
      return openDoor()
  }
}

function initListeners () {
  actionEmitter.on('doorManager', processDoorManager)
}

function run () {
  setup()
  .then(initListeners)
  .then(() => setInterval(poll, POLL_INTERVAL))
}
