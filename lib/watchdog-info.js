const pify = require('pify')
const fs = require('fs')
const writeFile = pify(fs.writeFile)
const path = require('path')


function save (dataPath, newInfo) {
  return writeFile(path.resolve(dataPath, 'watchdog-info.json'), JSON.stringify(newInfo))
}

function load (dataPath) {
  try {
    const watchdogPath = path.resolve(dataPath, 'watchdog-info.json')
    const test = JSON.parse(fs.readFileSync(watchdogPath))
    console.log(test)
    console.log(typeof test)
    return test
  } catch (err) {
    return {}
  }
}

module.exports = { save, load }
