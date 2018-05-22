module.exports = {parse}

const crypto = require('crypto')

const _ = require('lodash/fp')

const parsers = [
  require('./parsepdf417-us'),
  require('./parsepdf417-za')
]

function generateUID (subfile) {
  return crypto.createHash('sha256').update(subfile).digest('hex')
}

function parse (data) {
  let result = null

  const dataStr = data.toString()

  const singleParse = parser => {
    const r = parser.parse(dataStr)
    if (!r) return true

    result = r
    return false
  }

  _.forEach(singleParse, parsers)

  return _.set('uid', generateUID(dataStr), result)
}
