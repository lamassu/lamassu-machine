const _ = require('lodash/fp')
const municipalities = require('./col-municipalities')

module.exports.parse = function parse (data) {
  try {
    return parseRaw(data)
  } catch (ex) {
    return null
  }
}

function parseData (data) {
  let lastChar = ''
  let token = ''
  const parsedData = []

  if (!data || data === '') return parsedData

  function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
  }

  for(let i = 0; i < _.size(data); i++) {
    if (i === 0) {
      lastChar = data[i]
      token += data[i]
    } else {
      if ((isNumeric(lastChar) && isNumeric(data[i])) || (!isNumeric(lastChar) && !isNumeric(data[i]))) {
        token += data[i]
      } else {
        parsedData.push(token)
        token = ''
        token += data[i]
      }
      lastChar = data[i]
    }
  }

  return parsedData
}

function parseDate (dirtyDate) {
  const year = dirtyDate.substr(0, 4)
  const month = dirtyDate.substr(4, 2)
  const day = dirtyDate.substr(6, 2)

  return year + month + day
}

function parseName (dirtyName) {
  let name = ''
  for (let i = 0; i < _.size(dirtyName); i++) {
    if((dirtyName.charCodeAt(i) < 65 || dirtyName.charCodeAt(i) > 90) && (dirtyName.charCodeAt(i) < 97 || dirtyName.charCodeAt(i) > 122)) {
      if (name[_.size(name) - 1] !== ' ') name += ' '
    } else {
      name += dirtyName[i]
    }
  }
  return name
}

function getLocation (departmentCode, municipalityCode) {
  return _.find(it => it[0] === municipalityCode && it[1] === departmentCode, municipalities)
}

function parseRaw (data) {
  const parsedData = parseData(data)

  const municipalityCode = parsedData[10].substr(8, 2)
  const departmentCode = parsedData[10].substr(10, 3)

  const fullName = parseName(parsedData[7]).trim()
  const names = fullName.split(' ')
  const location = getLocation(departmentCode, municipalityCode)

  const result = {
    country: 'CO',
    personType: parsedData[8].trim() == 0 ? 'native' : parsedData[8].trim() == 1 ? 'foreign' : '',
    documentType: parsedData[12].trim() == 1 ? 'driver_license' : parsedData[12].trim() == 2 ? 'citizen_id' : '',
    documentNumber: parsedData[6].trim(),
    fullName: fullName,
    firstName: names[0],
    lastName: names[_.size(names) - 1],
    dateOfBirth: parseDate(parsedData[10].substr(0, 8).trim()),
    bloodType: parsedData[11].trim(),
    gender: parsedData[9].trim(),
    department: location[2],
    municipality: location[3],
    afisCode: parsedData[0].substr(2, _.size(parsedData[0])).trim(),
    fingerCard: parsedData[4].trim()
  }

  return _.pickBy(_.identity, result)
}