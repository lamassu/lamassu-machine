const fs = require('fs')
const pify = require('pify')
const _ = require('lodash/fp')

const readFile = pify(fs.readFile)
const writeFile = pify(fs.writeFile)
const accessFile = pify(fs.access)

const DOOR_ACTIVATE_ADDR = 248
const DOOR_LOCK_STATUS_ADDR = 166
const DOOR_LATCH_STATUS_ADDR = 132

module.exports = {setupInputs, setupOutputs, readValue, writeValue, openDoor, doorStatus, monitorLatch}

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
  const addresses = [DOOR_LATCH_STATUS_ADDR, DOOR_LOCK_STATUS_ADDR]
  return Promise.all(_.map(setupInput, addresses))
}

function setupOutputs () {
  const addresses = [DOOR_ACTIVATE_ADDR]
  return Promise.all(_.map(setupOutput, addresses))
}

function writeValue (address, value) {
  console.log(`/sys/class/gpio/gpio${address}/value`)
  console.log(value.toString())
  return writeFile(`/sys/class/gpio/gpio${address}/value`, value.toString())
}

function openDoor () {
  return writeValue(DOOR_ACTIVATE_ADDR, 1)
  .then(() => delay(2000))
  .then(() => writeValue(DOOR_ACTIVATE_ADDR, 0))
}

function readValue (address) {
  return readFile(`/sys/class/gpio/gpio${address}/value`)
  .then(r => r.toString())
}

function delay (ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function doorStatus () {
  return Promise.all(_.map(readValue, [DOOR_LATCH_STATUS_ADDR, DOOR_LOCK_STATUS_ADDR]))
  .then(_.zipObject(['latch', 'lock']))
}

function monitorValue (address) {
  const path = `/sys/class/gpio/gpio${address}/value`
  return fs.watch(path)
}

function monitorLatch () { return monitorValue(DOOR_LATCH_STATUS_ADDR) }
