const { extract } = require('../lib/pairing')
const TOTEM = process.argv[2]
console.log(
  TOTEM ?
    Object.assign(extract(TOTEM), { TOTEM }) :
    "Usage: node decode-pairing-totem.js <TOTEM>"
)

