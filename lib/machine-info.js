const pify = require('pify')
const fs = require('fs')
const writeFile = pify(fs.writeFile)
const path = require('path')
const _ = require('lodash/fp')

let MACHINE_INFO = null

function save (dataPath, machineInfo) {
  machineInfo = _.assign(machineInfo, { active: true })
  if (_.isEqual(MACHINE_INFO, machineInfo)) return Promise.resolve()
  MACHINE_INFO = machineInfo
  return writeFile(path.resolve(dataPath, 'machine-info.json'), JSON.stringify(machineInfo))
}

function load (dataPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(dataPath, 'machine-info.json')))
  } catch (err) {
    return { active: false }
  }
}

module.exports = { save, load }
