// base58 alphabet source: https://en.bitcoin.it/wiki/Base58Check_encoding#Base58_symbol_chart
const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const b58 = require('base-x')(BASE58)
const cbor = require('cbor-sync')
const CRC32 = require('crc-32'); 

module.exports = {depositUrl, parseUrl}

function assertValidAddress(address) { 
  let bytes;
  
  try {
    bytes = b58.decode(address)
  } catch (e) {
    throw new Error(`Ivalid address ${address}: not a base58 string`)
  }

  const cborData = cbor.decode(bytes)

  if (!Array.isArray(cborData) || cborData.length !== 2) {
    throw new Error(`Ivalid address ${address}: not a 2 elemenets CBOR array`)
  }
  
  const addrData = cborData[0]
  const addrChecksum = cborData[1]
  
  const checksum = CRC32.buf(addrData) >>> 0 // force usigned integer
  
  if (addrChecksum !== checksum) {
    throw new Error(`Ivalid address ${address}: invalid checksum`)
  }
}

function parseUrl(network, address) {
  if (!network) throw new Error('No network supplied.')
  if (!address) throw new Error('No address supplied.')

  console.log('DEBUG16: [%s] *%s*', network, address)

  // Cardano in Byron era does not recognize network type (main/test) by address prefixes like e.g. bitcoin,
  // so this is reason why `network` parameter is not used
  assertValidAddress(address);

  return address
}

function depositUrl(address, amount) {
  return `${address}?amount=${amount}`
}
