const path = require('path')
const { init } = require('../lib/pairing')

const number = process.argv[2]

const certPath = {
  cert: path.resolve(__dirname, 'machines', number, 'client.pem'),
  key: path.resolve(__dirname, 'machines', number, 'client.key')
}

init(certPath)
