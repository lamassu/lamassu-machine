var R = require('ramda')

// For now, just do special case of two cartridges; general problem is harder
exports.makeChange = function makeChange (cartridges, amount) {
  var small = cartridges[0]
  var large = cartridges[1]
  var largeDenom = large.denomination
  var largeBills = Math.min(large.count, Math.floor(amount / largeDenom))
  for (var i = largeBills; i >= 0; i--) {
    var remainder = amount - (largeDenom * i)
    if (remainder % small.denomination !== 0) continue
    var smallCount = remainder / small.denomination
    if (smallCount > small.count) continue
    return [
      {count: smallCount, denomination: small.denomination},
      {count: i, denomination: largeDenom}
    ]
  }
  return null
}

exports.sumChange = function sumChange (arr) {
  if (arr.length === 0) {
    return [{count: 0}, {count: 0}]
  }

  var smallDenom = arr[0][0].denomination
  var largeDenom = arr[0][1].denomination

  function pluckDenom (i) {
    return R.compose(R.prop('denomination'), R.nth(i))
  }

  if (!R.allPass(R.equals(smallDenom, pluckDenom(0)), arr)) {
    throw new Error('Not all small denominations are %d', smallDenom)
  }

  if (!R.allPass(R.equals(largeDenom, pluckDenom(1)), arr)) {
    throw new Error('Not all large denominations are %d', largeDenom)
  }

  function smallAdd (accum, item) {
    return accum + item[0].count
  }

  function largeAdd (accum, item) {
    return accum + item[1].count
  }

  return [
    {count: R.reduce(smallAdd, 0, arr), denomination: smallDenom},
    {count: R.reduce(largeAdd, 0, arr), denomination: largeDenom}
  ]
}

exports.available = function available (cartridges, bills) {
  var matchingDenoms = cartridges[0].denomination === bills[0].denomination &&
    cartridges[1].denomination === bills[1].denomination
  if (!matchingDenoms) throw new Error('Denominations don\'t match')
  return cartridges[0].count >= bills[0].count &&
    cartridges[1].count >= bills[1].count
}
