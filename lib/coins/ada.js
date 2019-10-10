const b58 = require('b58')
const cbor = require('cbor-sync')
const CRC32 = require('crc-32'); 

module.exports = {depositUrl, parseUrl}

function parseUrl(network, address) {
  console.log('DEBUG16: [%s] *%s*', network, address)

  // Cardano in Byron era not recognize network type (main/test) by address prefixes like f.e. bitcoin
  if (!validate(address)) return null

  return address
}

function depositUrl(address, amount) {
  return `${address}?amount=${amount}`
}

function validate(address) { 
  const bytes = b58.decode(address)

  const cborData = cbor.decode(bytes)

  if (!Array.isArray(cborData) || cborData.length !== 2) {
      console.error('Wrong address format! (expecting 2 elements CBOR array)')
      return false
  }
  
  const addrData = cborData[0]
  const addrChecksum = cborData[1]
  
  const checksum = CRC32.buf(addrData) >>> 0 // force usigned integer
  
  if (addrChecksum !== checksum) {
      console.error('Ivalid address %s (invalid checksum)', address)
      return false
  }

  return true
}
