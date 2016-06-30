var _ = require('lodash')
var crypto = require('crypto')

var CODES = {
  DAA: 'fullName',
  DCS: 'lastName',
  DAC: 'firstName',
  DCT: 'firstName',
  DBB: 'dateOfBirth',
  DAG: 'address',
  DAI: 'city',
  DAJ: 'state',
  DAK: 'postalCode',
  DCG: 'country',
  DAB: 'lastName',
  DAL: 'address',
  DAN: 'city',
  DAO: 'state',
  DAP: 'postalCode'
}

module.exports.parse = function parse (data) {
  try {
    return parseRaw(data.toString())
  } catch (ex) {
    return null
  }
}

// This generates a unique, reproducible ID based on the info in the barcode
function generateUID (subfile) {
  return crypto.createHash('sha256').update(subfile).digest('hex')
}

function parseRaw (data) {
  var uid = generateUID(data)
  var result = {uid: uid}

  var ansiIndex = data.indexOf('ANSI ')
  var actualData, version
  if (ansiIndex === -1) {
    var firstDL = data.indexOf('DL')
    var secondDL = data.indexOf('DL', firstDL)
    actualData = data.substr(secondDL + 2)
    version = 100
  } else {
    actualData = data.substr(ansiIndex + 5)
    version = parseInt(actualData.substr(6, 2), 10)
  }

  var lines = actualData.split(/[\n\r]/)
  var re = /^(\d|DL|Z.|DI)*/
  var firstLine = lines[0]
  var modFirstLine = firstLine.replace(re, '')
  var goodLines = [modFirstLine].concat(lines.slice(1))
  _.forEach(goodLines, function (line) {
    var code = line.substr(0, 3)
    var val = line.substr(3).trim()
    var codeName = CODES[code]
    if (!codeName) return
    result[codeName] = val
  })

  return normalize(result, version)
}

function normalize (result, version) {
  if (!result.lastName && result.fullName) {
    var names = result.fullName.split(',')
    result.lastName = names[0]
    result.firstName = names[1]
  }
  if (result.firstName) result.firstName = result.firstName.split(',')[0]
  var date = result.dateOfBirth.replace(/\-/g, '')
  result.country = result.country || 'USA'

  if (result.country === 'USA' && version > 1) {
    result.dateOfBirth = date.substr(4, 4) + date.substr(0, 4)
  }

  result.postalCode = result.postalCode.substr(0, 5)

  return result
}
