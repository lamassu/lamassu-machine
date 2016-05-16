var usbreset = require('../lib/usbreset')

var basePath = process.argv[2]
usbreset.reset(basePath)
