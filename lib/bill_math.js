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

  const upperBound = (denom, count) => Math.min(Math.floor(target/denom), count)

  const denomCounts = _.reduce(
    (ret, { denomination, count }) =>
      _.set(denomination, _.defaultTo(0, _.get([denomination], ret)) + count, ret),
    {},
    cashUnits
  )
  const denoms = _.keys(denomCounts)

  /*
   * Constraints of the problem, i.e., target we need to reach, and number of
   * bills the machine has available to dispense.
   * {
   *   c5:  { max: 789 },
   *   c10: { max: 456 },
   *   c50: { max: 123 },
   *   value: { equal: 765 },
   * }
   */
  const constraints = _.flow(
    _.toPairs,
    _.map(([denom, count]) => [c(denom), { max: upperBound(denom, count) }]),
    _.fromPairs,
    _.set('value', { equal: target }),
  )(denomCounts)

  /*
   * Variables of the problem, i.e., denominations available, along with their
   * value and some math boilerplate.
   * {
   *   5:  { value: 5,  c5:  1, provided: 1 }
   *   10: { value: 10, c10: 1, provided: 1 }
   *   50: { value: 50, c50: 1, provided: 1 }
   * }
   */
  const variables = _.flow(
    _.map(denom => [
      v(denom),
      { value: denom, [c(denom)]: 1, provided: 1 }
    ]),
    _.fromPairs,
  )(denoms)

  /*
   * All the variables in our problem are integer.
   * ['5', '10', '50']
   */
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
