const cp = require('child_process')
const fs = require('fs')

const KEY_PATH = '/tmp/lamassu-machine.key'

function generateKeyPair () {
  return new Promise((resolve, reject) => {
    cp.execFile('openssl', ['genrsa', '-out', KEY_PATH, '4096'], (err, stdout, stderr) => {
      if (err) return reject(err)

      cp.execFile('openssl', ['rsa', '-in', KEY_PATH, '-pubout'], (err, stdout) => {
        if (err) return reject(err)
        const privateKey = fs.readFileSync(KEY_PATH, {encoding: 'utf8'})
        fs.unlinkSync(KEY_PATH)
        return resolve({
          privateKey,
          publicKey: stdout
        })
      })
    })
  })
}

module.exports = {generateKeyPair}
