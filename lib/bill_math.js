const _ = require('lodash/fp')
const uuid = require('uuid')

const MAX_AMOUNT_OF_SOLUTIONS = 10000
const MAX_BRUTEFORCE_ITERATIONS = 10000000

function newSolution(cassettes, c0, c1, c2, c3, shouldFlip) {
  return [
    {
      provisioned: shouldFlip ? cassettes[0].count - c0 : c0,
      denomination: cassettes[0].denomination
    },
    {
      provisioned: shouldFlip ? cassettes[1].count - c1 : c1,
      denomination: cassettes[1].denomination
    },
    {
      provisioned: shouldFlip ? cassettes[2].count - c2 : c2,
      denomination: cassettes[2].denomination
    },
    {
      provisioned: shouldFlip ? cassettes[3].count - c3 : c3,
      denomination: cassettes[3].denomination
    }
  ]
}

function mergeCassettes(cassettes) {
  const map = {}

  _.forEach(it => {
    if (!map[it.denomination]) {
      map[it.denomination] = 0
    }
    map[it.denomination] += it.count
  }, cassettes)

  return _.map(it => ({ denomination: it, count: map[it] }), _.keys(map))
}

function unmergeCassettes(cassettes, output) {
  const map = {}

  _.forEach(it => {
    if (!map[it.denomination]) {
      map[it.denomination] = 0
    }
    map[it.denomination] += it.provisioned
  }, output)

  const response = []
  _.forEach(it => {
    const value = {
      denomination: it.denomination,
      id: uuid.v4()
    }

    const amountNeeded = map[it.denomination]
    if (!amountNeeded) {
      return response.push({ provisioned: 0, ...value })
    }

    if (amountNeeded < it.count) {
      map[it.denomination] = 0
      return response.push({ provisioned: amountNeeded, ...value })
    }

    map[it.denomination] -= it.count
    return response.push({ provisioned: it.count, ...value })
  }, cassettes)

  return response
}

function makeChangeDuo(cassettes, amount) {
  // Initialize empty cassettes in case of undefined, due to same denomination across all cassettes results in a single merged cassette
  const small = !_.isNil(cassettes[0]) ? cassettes[0] : { denomination: 0, count: 0 }
  const large = !_.isNil(cassettes[1]) ? cassettes[1] : { denomination: 0, count: 0 }

  const largeDenom = large.denomination
  const smallDenom = small.denomination
  const largeBills = Math.min(large.count, Math.floor(amount / largeDenom))
  const amountNum = amount.toNumber()

  for (let i = largeBills; i >= 0; i--) {
    const remainder = amountNum - largeDenom * i

    if (remainder % smallDenom !== 0) continue
    const smallCount = remainder / smallDenom
    if (smallCount > small.count) continue
    return [
      {
        provisioned: smallCount,
        denomination: small.denomination,
        id: uuid.v4()
      },
      { provisioned: i, denomination: largeDenom, id: uuid.v4() }
    ]
  }

  return []
}

function makeChange(outCassettes, amount) {
  const available = _.reduce(
    (res, val) => res + val.count * val.denomination,
    0,
    outCassettes
  )

  if (available < amount) {
    console.log(`Tried to dispense more than was available for amount ${amount.toNumber()} with cassettes ${JSON.stringify(cassettes)}`)
    return null
  }

  const cassettes = mergeCassettes(outCassettes)
  const result =
    _.size(cassettes) >= 3
      ? makeChangeDynamic(cassettes, amount, available)
      : makeChangeDuo(cassettes, amount)

  if (!result.length) return null
  return unmergeCassettes(outCassettes, result)
}

function makeChangeDynamicBruteForce(outCassettes, amount, available) {
  const solutions = []
  let x = 0

  const shouldFlip = amount > _.max(_.map(it => it.denomination * it.count, outCassettes))
  const amountNum = shouldFlip ? available - amount : amount

  const cassettes = shouldFlip ? _.reverse(outCassettes) : outCassettes
  const { denomination: denomination0, count: count0 } = cassettes[0]
  const { denomination: denomination1, count: count1 } = cassettes[1]
  const { denomination: denomination2, count: count2 } = cassettes[2]
  const { denomination: denomination3, count: count3 } = cassettes[3]

  const startTime = new Date().getTime()

  loop1: for (let i = 0; i <= count0; i++) {
    const firstSum = i * denomination0

    for (let j = 0; j <= count1; j++) {
      const secondSum = firstSum + j * denomination1
      if (secondSum > amountNum) break

      if (secondSum === amountNum) {
        solutions.push(newSolution(cassettes, i, j, 0, 0, shouldFlip))
      }

      for (let k = 0; k <= count2; k++) {
        const thirdSum = secondSum + k * denomination2
        if (thirdSum > amountNum) break

        if (denomination2 === 0) break

        if (thirdSum === amountNum) {
          solutions.push(newSolution(cassettes, i, j, k, 0, shouldFlip))
        }

        for (let l = 0; l <= count3; l++) {
          if ((x > MAX_AMOUNT_OF_SOLUTIONS && solutions.length >= 1) || x > MAX_BRUTEFORCE_ITERATIONS) break loop1
          x++
          const fourthSum = thirdSum + l * denomination3
          if (fourthSum > amountNum) break

          if (denomination3 === 0) break

          if (fourthSum === amountNum) {
            solutions.push(newSolution(cassettes, i, j, k, l, shouldFlip))
          }
        }
      }
    }
  }

  return solutions
}

function makeChangeDynamic(cassettes, amount, available) {
  while (_.size(cassettes) < 4) {
    cassettes.push({ denomination: 0, count: 0 })
  }

  const amountNum = amount.toNumber()

  const solutions = makeChangeDynamicBruteForce(cassettes, amountNum, available)

  const sortedSolutions = _.sortBy(it => {
    const arr = []

    for (let la = 0; la < 4; la++) {
      arr.push(cassettes[la].count - it[la].provisioned)
    }

    if (arr.length < 2) return Infinity
    return _.max(arr) - _.min(arr)
  }, solutions)

  const cleanSolution = _.filter(
    it => it.denomination > 0,
    _.head(sortedSolutions)
  )

  const response = cleanSolution

  // Final sanity check
  let total = 0
  _.forEach(it => {
    total += it.provisioned * it.denomination
  }, response)

  if (total === amountNum) return response

  console.log(
    `Failed to find a solution for ${amountNum} with cassettes ${JSON.stringify(cassettes)}`
  )
  return []
}

module.exports = { makeChange }
