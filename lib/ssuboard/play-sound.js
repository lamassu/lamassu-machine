const cp = require('child_process')

module.exports = {play}

function play (filePath) {
  cp.spawn('/usr/bin/aplay', [filePath], {stdio: 'ignore'})
}
