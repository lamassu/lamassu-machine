module.exports = {parse}

const crypto = require('crypto')

const parsers = [
  require('./parsepdf417-us'),
  require('./parsepdf417-ca-bc'),
  require('./parsepdf417-za'),
  require('./parsepdf417-col')
]

function generateUID (subfile) {
  return crypto.createHash('sha256').update(subfile).digest('hex')
}

function parse (data) {
  data = data.toString()
  const result = parsers
    .map(parser => parser.parse(data))
    .find(result => !!result) || null
  if (result) {
    result.uid = generateUID(data)
    result.raw = data
  }
  return result
}
