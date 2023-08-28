const _ = require('lodash/fp')

const test_dispensedArray = [{
  "Currency": "USD",
  "Denomination": 1,
  "Amount": 2,
  "CashType": 1
}]

const test_after = [{
    "Currency": {
        "CurrencyCode": "USD",
        "Denomination": 1,
        "NoteID": 0
    },
    "Position": 25,
    "Count": 0,
}]

const test_before = [{
    "Currency": {
        "CurrencyCode": "USD",
        "Denomination": 1,
        "NoteID": 0
    },
    "Position": 25,
    "Count": 2,
}]

const magic = (before, after, dispensedArray) => {
  const dispensedDenominationCount = _.flow(
    _.groupBy(_.get(['Denomination'])),
    _.mapValues(_.sumBy(_.get(['Amount'])))
  )(dispensedArray) // :: { Denomination: Amount, ... }
  //console.log("dispensedDenominationCount:", dispensedDenominationCount)


  const set = f => (ret, s) => _.set([s.Position, f], s, ret)
  const diff = _.flow(
    init => _.reduce(set('before'), init, before),
    init => _.reduce(set('after'), init, after),
    _.mapValues(({ before, after }) => _.set('Count', before.Count-after.Count, after)),
  )({}) // { Position: { Currency, Position, Count }, ... }
  //console.log("diff:", diff)

  const attemptedDispenseDenominationCount = _.flow(
    _.values,
    _.groupBy(_.get(['Currency', 'Denomination'])),
    _.mapValues(_.sumBy(_.get(['Count']))),
  )(diff) // { Denomination: Count, ... }
  //console.log("attemptedDispenseDenominationCount:", attemptedDispenseDenominationCount)

  // { Denomination: Count, ... }
  const rejectedDenominationCount = _.mergeWith((attempted, dispensed) => attempted-dispensed, attemptedDispenseDenominationCount, dispensedDenominationCount)
  //console.log("rejectedDenominationCount:", rejectedDenominationCount)

  const diffRejectCorrected = _.reduce(
    ({ ret, rejected }, cudiff) => {
      const denom = cudiff.Currency.Denomination
      const RejectCount = (cudiff.Count > 0) ? _.min([rejected[denom], cudiff.Count]) : 0
      const Count = cudiff.Count - RejectCount
      const newRejectedCount = rejected[denom] - RejectCount
      const newcudiff = _.assign(cudiff, { Count, RejectCount, DispensedCount: Count }) // TODO: deixar DispensedCount?
      return {
        ret: _.set(cudiff.Position, newcudiff, ret),
        rejected: _.set(denom, newRejectedCount, rejected)
      }
    },
    { ret: {}, rejected: rejectedDenominationCount },
    _.values(diff)
  ).ret // { Position: { Currency, Position, Count }, ... }

  return _.values(diffRejectCorrected)
}

module.exports = magic 
