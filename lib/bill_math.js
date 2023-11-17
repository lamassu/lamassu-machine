const _ = require('lodash/fp')
const { solve, defaultOptions } = require('yalps')
const BN = require('./bn')

const OPTIONS = _.assign(defaultOptions, {
    includeZeroVariables: true,
    maxIterations: defaultOptions.maxIterations/2,
})


const solutionToOriginalUnits = (solution, units) => {
  const billsToAssign = (count, left) => _.clamp(0, count)(_.isNaN(left) || _.isNil(left) ? 0 : left)

  const billsLeft = _.flow(
    _.map(([denomination, provisioned]) => [BN(denomination), provisioned]),
    _.fromPairs,
  )(solution)

  return _.map(
    ({ count, name, denomination }) => {
      const provisioned = billsToAssign(count, billsLeft[denomination])
      billsLeft[denomination] -= provisioned
      return { name, denomination, provisioned }
    },
    units
  )
}

const makeModel = (cashUnits, target) => {
  const c = denom => `c${denom}`
  const v = denom => denom

  const denomCounts = _.reduce(
    (ret, { denomination, count }) =>
      _.set(denomination, _.defaultTo(0, _.get([denomination], ret)) + count, ret),
    {},
    cashUnits
  )
  const denoms = _.keys(denomCounts)

  const constraints = _.flow(
    _.toPairs,
    _.map(([denom, count]) => [c(denom), { max: count }]),
    _.fromPairs,
    _.set('value', { equal: target }),
  )(denomCounts)

  const variables = _.flow(
    _.map(denom => [
      v(denom),
      { value: denom, [c(denom)]: 1, provided: 1 }
    ]),
    _.fromPairs,
  )(denoms)

  const integers = _.map(v, denoms)

  return {
    objective: "provided", direction: "minimize",
    constraints, variables, integers,
  }
}

/*
 * cashUnits :: [{ denomination::Int, count::Int }]
 * amount :: Int
 */
const makeChange = (cashUnits, amount) => {
  const model = makeModel(cashUnits, amount)
  const result = solve(model, OPTIONS)
  return result.status === 'optimal' ?
    solutionToOriginalUnits(result.variables, cashUnits) :
    null
}

module.exports = { makeChange }
