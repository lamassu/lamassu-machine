var _ = require('lodash/fp')
const countries = require('./countries')

var CODES = {
  DAA: 'fullName',
  DCS: 'lastName',
  DAC: 'firstName',
  DCT: 'firstName',
  DBA: 'expirationDate',
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
  DAP: 'postalCode',
  DAQ: 'documentNumber',
  DBC: 'gender'
}

const states = {
  'CA': ['AB', 'BC', 'MB', 'NB', 'NL', 'NT', 'NS', 'NU', 'ON', 'PE', 'QC', 'SK', 'YT'],
  'US': ['AL', 'AK', 'AS', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC',
    'FM', 'FL', 'GA', 'GU', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS',
    'KY', 'LA', 'ME', 'MH', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO',
    'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'MP',
    'OH', 'OK', 'OR', 'PW', 'PA', 'PR', 'RI', 'SC', 'SD', 'TN',
    'TX', 'UT', 'VT', 'VI', 'VA', 'WA', 'WV', 'WI', 'WY']
}

const usDateFormatExceptions = {
  YYYYMMDD: ['HI'],
  MMDDYYYY: []
}

module.exports.parse = function parse (data) {
  try {
    return parseRaw(data)
  } catch (ex) {
    return null
  }
}

function parseRaw (data) {
  const result = {}

  var ansiIndex = data.indexOf('ANSI ')
  var actualData, version, issuingAuthorityNumber
  if (ansiIndex === -1) {
    var firstDL = data.indexOf('DL')
    var secondDL = data.indexOf('DL', firstDL)
    actualData = data.substr(secondDL + 2)
    version = 100
    issuingAuthorityNumber = null
  } else {
    actualData = data.substr(ansiIndex + 5)
    version = parseInt(actualData.substr(6, 2), 10)
    issuingAuthorityNumber = actualData.substr(0, 6)
  }

  var lines = actualData.split(/[\n\r]/)
  var re = /^(\d|DL|Z.|DI)*/
  var firstLine = lines[0]
  var modFirstLine = firstLine.replace(re, '')
  var goodLines = [modFirstLine].concat(lines.slice(1))

  _.forEach(line => {
    var code = line.substr(0, 3)
    var val = line.substr(3).trim()
    var codeName = CODES[code]

    if (!codeName) return
    result[codeName] = val
  }, goodLines)

  return normalize(result, version, issuingAuthorityNumber)
}

function getCountry (state) {
  return _.findKey(_.includes(state), states) || 'USA'
}

function normalize (result, version, issuingAuthorityNumber) {
  if (!result.lastName && result.fullName) {
    var names = result.fullName.split(',')

    if (issuingAuthorityNumber === '636020') {
      // Colorado is doing it wrong
      result.lastName = names[names.length - 1]
      result.firstName = names[0]
    } else {
      result.lastName = names[0]
      result.firstName = names[1]
    }
  }
  if (result.firstName) result.firstName = result.firstName.split(',')[0]
  var date = result.dateOfBirth.replace(/-/g, '')
  var expirationDate = result.expirationDate ? result.expirationDate.replace(/-/g, '') : null
  result.country = (result.country && countries.toAlpha2(result.country)) || getCountry(result.state) || 'US'

  if (result.country === 'US' && version > 1) {
    result.dateOfBirth = _.includes(result.state, usDateFormatExceptions['YYYYMMDD'])
      ? date
      : date.substr(4, 4) + date.substr(0, 4)

    result.expirationDate = expirationDate
      ? _.includes(result.state, usDateFormatExceptions['YYYYMMDD'])
        ? expirationDate
        : expirationDate.substr(4, 4) + expirationDate.substr(0, 4)
      : expirationDate
  }

  // In US cards, gender comes as a number. In BC and ZA cards, gender comes as a letter
  result.gender = _.equals(result.gender, '1') ? 'M' : 'F'

  result.postalCode = _.isNil(result.postalCode)
    ? undefined
    : result.postalCode.substr(0, 5)

  return _.pickBy(_.identity, result)
}
