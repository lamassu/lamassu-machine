const pify = require('pify')
const fs = require('fs')
const writeFile = pify(fs.writeFile)
const path = require('path')
const _ = require('lodash/fp')

let operatorInfo = null

function save (dataPath, newInfo) {
  if (_.isEqual(operatorInfo, newInfo)) return Promise.resolve()
  operatorInfo = newInfo
  return writeFile(path.resolve(dataPath, 'operator-info.json'), JSON.stringify(newInfo))
}

function load (dataPath) {
  try {
    if (operatorInfo) return operatorInfo
    return JSON.parse(fs.readFileSync(path.resolve(dataPath, 'operator-info.json')))
  } catch (err) {
    return { active: false }
  }
}

module.exports = { save, load }
