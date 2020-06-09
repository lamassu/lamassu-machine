const clim = require('clim')

clim.getTime = function () {
  return new Date().toISOString()
}

clim.logWrite = function (level, prefixes, msg) {
  const timestamp = clim.getTime()
  var line = timestamp + ' ' + level
  if (prefixes.length > 0) line += ' ' + prefixes.join(' ')
  line += ' ' + msg
  process.stderr.write(line + '\n')
}

clim(console, true)
