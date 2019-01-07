import _ from 'lodash/fp'
import test from 'ava'
import optimizeDispense from '../../lib/dispense-optimizer'

const LIMIT = 20

const optimizeDispenseWithLimit = inputArr => optimizeDispense(inputArr, LIMIT)

test('Pass one bach without limit', t => {
  const o = optimizeDispense([2, 6], null)
  t.true(_.isEqual(o, [[2,6]]))
})

test('Pass only one batch', t => {
  const o = optimizeDispenseWithLimit([2, 6])

  t.is(o.length, 1)
})

test('Pass multiple batches where a < b', t => {
  const o = optimizeDispenseWithLimit([4, 43])

  t.is(o.length, 3)
})

test('Pass multiple batches where a > b', t => {
  const o = optimizeDispenseWithLimit([54, 12])

  t.is(o.length, 4)
})

test('Pass multiple batches where a = b', t => {
  const o = optimizeDispenseWithLimit([40, 40])

  t.is(o.length, 4)
})

test('Sum of optimized batches equals input', t => {
  const o = optimizeDispenseWithLimit([54, 12])

  t.is(_.sum(_.flatten(o)), 66)
})
