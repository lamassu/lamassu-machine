module.exports = {parse}

const _ = require('lodash/fp')

const parsers = [
  require('./parsepdf417-us'),
  require('./parsepdf417-za')
]

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

  return result
}
