const pify = require('pify')
const fs = require('fs')
const writeFile = pify(fs.writeFile)
const path = require('path')

function save (dataPath, operatorInfo) {
  return writeFile(path.resolve(dataPath, 'operator-info.json'), JSON.stringify(operatorInfo))
}

function load (dataPath) {
  try {
    return JSON.parse(fs.readFileSync(path.resolve(dataPath, 'operator-info.json')))
  } catch (err) {
    return { active: false }
  }
}

module.exports = { save, load }
