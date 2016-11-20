const path = require('path')
const lamassuMachineRoot = path.resolve(__dirname, '..')
const lamassuAdminServerRoot = path.resolve(lamassuMachineRoot, '..', 'lamassu-admin-server')

const Haikunator = require('haikunator')
const lamassuAdminServerPairing = require(path.resolve(lamassuAdminServerRoot, 'lib', 'pairing'))
const pairing = require('../lib/pairing')

const haikunator = new Haikunator()
const name = haikunator.haikunate({tokenLength: 0})

lamassuAdminServerPairing.totem('localhost', name)
.then(totem => {
  const clientCert = pairing.getCert(path.resolve(lamassuMachineRoot, 'data', 'cert.json'))
  const connectionInfoPath = path.resolve(lamassuMachineRoot, 'data', 'connection_info.json')

  console.log('DEBUG1: %s, %s', totem, connectionInfoPath)
  return pairing.pair(totem, clientCert, connectionInfoPath)
  .then(r => {
    console.log('paired.')
    process.exit(0)
  })
})
.catch(e => {
  console.log(e)
  process.exit(1)
})
