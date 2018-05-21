const _ = require('lodash/fp')

module.exports = {parse}

const months = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12
}

function convertDate (s) {
  const [day, monthStr, year] = s.split(' ')
  const month = months[monthStr]
  const pad = _.padCharsStart('0', 2)

  return `${year}${pad(month)}${pad(day)}`
}

function parse (data) {
  const fields = data.split('|')

  if (fields.length < 11) return null

  const dateOfBirth = convertDate(fields[5])
  return {
    lastName: fields[0],
    firstName: fields[1],
    fullName: `${fields[1]} ${fields[0]}`,
    dateOfBirth,
    documentNumber: fields[10],
    idNumber: fields[4]
  }
}
