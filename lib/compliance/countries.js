const _ = require('lodash/fp')
const countryCodes = require('./country-codes.json')

function toAlpha2 (alpha3Code) {
  if (alpha3Code.length === 2) return alpha3Code
  return countryCodes[alpha3Code]
}

function toAlpha3 (alpha2Code) {
  return _.findKey(alpha2Code, countryCodes)
}

module.exports = { toAlpha2, toAlpha3 }
