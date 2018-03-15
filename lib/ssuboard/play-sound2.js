const fs = require('fs')

const wav = require('wav')
const Speaker = require('speaker')

const reader = new wav.Reader()

module.exports = {play}

function play (filePath) {
  const file = fs.createReadStream(filePath)

  reader.on('format', function (format) {
    reader.pipe(new Speaker(format))
  })

  reader.on('error', console.log)

  file.pipe(reader)
}
