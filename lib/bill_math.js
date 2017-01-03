const _ = require('lodash/fp')
const BigNumber = require('bignumber.js')

// Greedy algorithm, optimal for most currencies
exports.makeChange = function makeChange (_cartridges, amount) {
  const cartridges = _.cloneDeep(_cartridges)

  const isDenom = denom => { return r => r.denomination.eq(denom) }

  let remainder = amount
  let bills = []

  while (true) {
    const relevant = r => r.count > 0 && r.denomination.lte(remainder)
    ? r.denomination
    : false

    const denoms = _.compact(_.map(relevant, cartridges))
    if (_.isEmpty(denoms)) return null
    const nextDenom = BigNumber.max(denoms)
    remainder = remainder.sub(nextDenom)

    const cartridgeRec = _.find(isDenom(nextDenom), cartridges)
    cartridgeRec.count -= 1

    const billRec = _.find(isDenom(nextDenom), bills)
    if (billRec) {
      billRec.count += 1
    } else {
      bills.push({denomination: nextDenom, count: 1})
    }

    console.log('%j', {bills, cartridges})
    if (remainder.eq(0)) return _.sortBy(r => r.denomination.toNumber(), bills)
  }
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
