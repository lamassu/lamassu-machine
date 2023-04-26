const _ = require('lodash/fp')
const sumService = require('@haensl/subset-sum')

const getSolution = (units, amount) => {
  const billList = _.reduce(
    (acc, value) => {
      acc.push(..._.times(_.constant(value.denomination.toNumber()), value.count))
      return acc
    },
    [],
    units
  )
  
  const solver = sumService.subsetSum(billList, amount.toNumber())
  const solution = _.countBy(Math.floor, solver.next().value)
  return _.reduce(
    (acc, value) => {
      acc.push({ denomination: _.toNumber(value), provisioned: solution[value] })
      return acc
    },
    [],
    _.keys(solution)
  )
}

const solutionToOriginalUnits = (solution, units) => {
  const billsLeft = _.clone(_.fromPairs(_.map(it => [it.denomination, it.provisioned])(solution)))
  return _.reduce(
    (acc, value) => {
      const unit = units[value]
      const billsToAssign = _.clamp(0, unit.count)(_.isNaN(billsLeft[unit.denomination]) || _.isNil(billsLeft[unit.denomination]) ? 0 : billsLeft[unit.denomination])
      acc.push({ name: unit.name, denomination: unit.denomination, provisioned: billsToAssign })
      billsLeft[unit.denomination] -= billsToAssign
      return acc
    },
    [],
    _.range(0, _.size(units))
  )
}

function makeChange(outCassettes, amount) {
  const solution = getSolution(outCassettes, amount)
  return solutionToOriginalUnits(solution, outCassettes)
}

module.exports = { makeChange }
