const pify = require('pify')
const fs = require('fs')
const writeFile = pify(fs.writeFile)
const path = require('path')
const _ = require('lodash/fp')

let machineInfo = null

function save (dataPath, newInfo) {
  newInfo = _.assign(newInfo, { active: true })
  if (_.isEqual(machineInfo, newInfo)) return Promise.resolve()
  machineInfo = newInfo
  return writeFile(path.resolve(dataPath, 'machine-info.json'), JSON.stringify(newInfo))
}

function load (dataPath) {
  try {
    if (machineInfo) return machineInfo
    return JSON.parse(fs.readFileSync(path.resolve(dataPath, 'machine-info.json')))
  } catch (err) {
    return { active: false }
  }
}

module.exports = { save, load }
