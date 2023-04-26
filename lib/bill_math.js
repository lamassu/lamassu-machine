const _ = require('lodash/fp')
const sumService = require('@haensl/subset-sum')

const BILL_LIST_MODES = {
  LAST_UNIT_FIRST: 0,
  FIRST_UNIT_FIRST: 1,
  LOWEST_VALUE_FIRST: 2,
  HIGHEST_VALUE_FIRST: 3,
  UNIT_ROUND_ROBIN: 4,
  VALUE_ROUND_ROBIN: 5
}

const buildBillList = (units, mode) => {
  switch (mode) {
    case BILL_LIST_MODES.LAST_UNIT_FIRST:
      return _.reduce(
        (acc, value) => {
          acc.push(..._.times(_.constant(value.denomination), value.count))
          return acc
        },
        [],
        _.reverse(units)
      )
    case BILL_LIST_MODES.FIRST_UNIT_FIRST:
      return _.reduce(
        (acc, value) => {
          acc.push(..._.times(_.constant(value.denomination), value.count))
          return acc
        },
        [],
        units
      )
    case BILL_LIST_MODES.LOWEST_VALUE_FIRST:
      return _.reduce(
        (acc, value) => {
          acc.push(..._.times(_.constant(value.denomination), value.count))
          return acc
        },
        [],
        _.orderBy(['denomination'], ['asc'])(units)
      )
    case BILL_LIST_MODES.HIGHEST_VALUE_FIRST:
      return _.reduce(
        (acc, value) => {
          acc.push(..._.times(_.constant(value.denomination), value.count))
          return acc
        },
        [],
        _.orderBy(['denomination'], ['desc'])(units)
      )
    case BILL_LIST_MODES.UNIT_ROUND_ROBIN:
      {
        const amountOfBills = _.reduce(
          (acc, value) => acc + value.count,
          0,
          units
        )
      
        const _units = _.cloneDeep(units)
        const bills = []
      
        for(let i = 0; i < amountOfBills; i++) {
          const idx = i % _.size(_units)
          if (_units[idx].count > 0) {
            bills.push(_units[idx].denomination)
          }
      
          _units[idx].count--
      
          if (_units[idx].count === 0) {
            _units.splice(idx, 1)
          }
        }

        return bills
      }
    case BILL_LIST_MODES.VALUE_ROUND_ROBIN:
      {
        const amountOfBills = _.reduce(
          (acc, value) => acc + value.count,
          0,
          units
        )
      
        const _units = _.orderBy(['denomination'], ['asc'])(_.cloneDeep(units))
        const bills = []
      
        for(let i = 0; i < amountOfBills; i++) {
          const idx = i % _.size(_units)
          if (_units[idx].count > 0) {
            bills.push(_units[idx].denomination)
          }
      
          _units[idx].count--
      
          if (_units[idx].count === 0) {
            _units.splice(idx, 1)
          }
        }

        return bills
      }
    default:
      throw new Error(`Invalid mode: ${mode}`)
  }
}

const getSolution = (units, amount, mode) => {
  const billList = buildBillList(units, mode)
  
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
  const solution = getSolution(outCassettes, amount, BILL_LIST_MODES.VALUE_ROUND_ROBIN)
  return solutionToOriginalUnits(solution, outCassettes)
}

module.exports = { makeChange }
