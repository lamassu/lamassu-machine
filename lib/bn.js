const BigNumber = require('bignumber.js')

BigNumber.config({ROUNDING_MODE: BigNumber.ROUND_HALF_EVEN})

function BN (s) { return new BigNumber(s) }
BN.klass = BigNumber

module.exports = BN
