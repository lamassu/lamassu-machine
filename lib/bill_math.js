// const _ = require('lodash/fp')
// const BigNumber = require('bignumber.js')
const BN = require('./bn')

// Custom algorith for two cassettes. For three or more denominations, we'll need
// to rethink this. Greedy algorithm fails to find *any* solution in some cases.
// Dynamic programming may be too inefficient for large amounts.
//
// We can either require canononical denominations for 3+, or try to expand
// this algorithm.
exports.makeChange = function makeChange (cartridges, amount) {
  // Note: Everything here is converted to primitive numbers,
  // since they're all integers, well within JS number range,
  // and this is way more efficient in a tight loop.

  const small = cartridges[0]
  const large = cartridges[1]

  const largeDenom = large.denomination.toNumber()
  const smallDenom = small.denomination.toNumber()
  const largeBills = Math.min(large.count, Math.floor(amount / largeDenom))
  const amountNum = amount.toNumber()

  for (let i = largeBills; i >= 0; i--) {
    const remainder = amountNum - largeDenom * i

    if (remainder % smallDenom !== 0) continue

    const smallCount = remainder / smallDenom
    if (smallCount > small.count) continue

    return [
      {count: smallCount, denomination: BN(small.denomination)},
      {count: i, denomination: BN(largeDenom)}
    ]
  }

  return null
}

// exports.sumChange = function sumChange (arr) {
//   if (arr.length === 0) {
//     return [{count: 0}, {count: 0}]
//   }

//   const smallDenom = arr[0][0].denomination
//   const largeDenom = arr[0][1].denomination

//   function pluckDenom (i) {
//     return R.compose(R.prop('denomination'), R.nth(i))
//   }

//   if (!R.allPass(R.equals(smallDenom, pluckDenom(0)), arr)) {
//     throw new Error('Not all small denominations are %d', smallDenom)
//   }

//   if (!R.allPass(R.equals(largeDenom, pluckDenom(1)), arr)) {
//     throw new Error('Not all large denominations are %d', largeDenom)
//   }

//   function smallAdd (accum, item) {
//     return accum + item[0].count
//   }

//   function largeAdd (accum, item) {
//     return accum + item[1].count
//   }

//   return [
//     {count: R.reduce(smallAdd, 0, arr), denomination: smallDenom},
//     {count: R.reduce(largeAdd, 0, arr), denomination: largeDenom}
//   ]
// }

exports.available = function available (cartridges, bills) {
  const matchingDenoms = cartridges[0].denomination === bills[0].denomination &&
    cartridges[1].denomination === bills[1].denomination
  if (!matchingDenoms) throw new Error('Denominations don\'t match')
  return cartridges[0].count >= bills[0].count &&
    cartridges[1].count >= bills[1].count
}
