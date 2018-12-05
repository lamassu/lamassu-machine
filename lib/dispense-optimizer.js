const _ = require('lodash/fp')

function computeBatch (inputArr, limit) {
  let batch = []
  let remainder = limit

  for (let i = 0; i < inputArr.length; i++) {
    const oldValue = inputArr[i]
    const newValue = _.min([oldValue, remainder])
    remainder -= newValue
    batch[i] = newValue
  }

  return batch
}

module.exports = function optimize (_inputArr, limit) {
  let inputArr = _.clone(_inputArr)
  let batches = []

  if (_.isNil(limit)) return [inputArr]

  while (_.sum(inputArr) > 0) {
    const batch = computeBatch(inputArr, limit)
    batches.push(batch)
    inputArr = _.zipWith(_.subtract, inputArr, batch)
  }

  return batches
}
