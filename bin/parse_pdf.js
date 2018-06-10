const fs = require('fs')
const util = require('util')
const parser = require('../lib/compliance/parsepdf417')

// const licensePath = 'mock_data/compliance/fl.dat'
const licensePath = 'scratch/nv.dat'

var data = fs.readFileSync(licensePath, 'utf8')
data = data.replace('&', '\r')

console.log(data)
var result = parser.parse(Buffer.from(data))
console.log(util.inspect(result, {depth: null, colors: true}))
