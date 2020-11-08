import test from 'ava'
import BillDispenser from '../../lib/mocks/billdispenser'
import Brain from '../../lib/brain'
import Configuration from '../../lib/configuration'
import optimizeDispense from '../../lib/dispense-optimizer'

const { billDispenser } = Configuration.loadConfig({})

const thisArg = {
  browser: () => ({ send: () => { } }),
  billDispenser: BillDispenser.factory(billDispenser)
}

test('batch dispense [20,0] limit 20', async t => {
  const notesToDispense = optimizeDispense([20, 0], 20)

  const initialParams = {
    batchAmount: notesToDispense.length,
    currentBatch: 1,
    dispenseRecords: [
      { dispensed: 0, rejected: 0 }, { dispensed: 0, rejected: 0 }
    ]
  }

  const { dispenseRecords, error } = await Brain.prototype._batchDispense.apply(thisArg, [notesToDispense[0], initialParams])
  t.falsy(error, 'No error should happen')
  t.deepEqual(dispenseRecords, [{ dispensed: 20, rejected: 0 }, { dispensed: 0, rejected: 0 }], 'Dispenses all 20 notes on first batch');
})


test('batch dispense [0,20] limit 20', async t => {

  const notesToDispense = optimizeDispense([0, 20], 20)

  const initialParams = {
    batchAmount: notesToDispense.length,
    currentBatch: 1,
    dispenseRecords: [
      { dispensed: 0, rejected: 0 }, { dispensed: 0, rejected: 0 }
    ]
  }

  const { dispenseRecords, error } = await Brain.prototype._batchDispense.apply(thisArg, [notesToDispense[0], initialParams])
  t.falsy(error, 'No error should happen')
  t.deepEqual(dispenseRecords, [{ dispensed: 0, rejected: 0 }, { dispensed: 20, rejected: 0 }], 'Dispenses all 20 notes on first batch');
})

test('batch dispense [0,101] limit 20', async t => {

  const notesToDispense = optimizeDispense([0, 101], 20)
  t.is(notesToDispense.length, 6)

  const initialParams = Promise.resolve({
    batchAmount: notesToDispense.length,
    currentBatch: 1,
    dispenseRecords: [
      { dispensed: 0, rejected: 0 }, { dispensed: 0, rejected: 0 }
    ]
  })

  const batches = notesToDispense.reduce((acc, notes) => acc.then(it => {
    const { batch, dispenseRecords, currentBatch, error } = it;

    if (currentBatch > 1 && currentBatch < 7) {
      t.falsy(error, 'No error should happen')
      t.deepEqual(batch, [{ dispensed: 0, rejected: 0 }, { dispensed: 20, rejected: 0 }], 'Current batch dispenses as expected');
      t.deepEqual(dispenseRecords, [{ dispensed: 0, rejected: 0 }, { dispensed: 20 * (currentBatch - 1), rejected: 0 }], 'Cumulative dispensed is as expected');
    }

    return Brain.prototype._batchDispense.apply(thisArg, [notes, it])
  }), initialParams)


  const { batch: lastBatch, dispenseRecords, error } = await batches
  t.falsy(error, 'No error should happen')
  t.deepEqual(lastBatch, [{ dispensed: 0, rejected: 0 }, { dispensed: 1, rejected: 0 }], 'Last batch should dispense as expected');
  t.deepEqual(dispenseRecords, [{ dispensed: 0, rejected: 0 }, { dispensed: 101, rejected: 0 }], 'Cumulative dispensed is as expected');
})

test('Pass only one batch [2, 6]', t => loopTest(t, [2, 6]))
test('Pass multiple batches where a < b [4, 43]', t => loopTest(t, [4, 43]))
test('Pass multiple batches where a = b [10, 10], 20', t => loopTest(t, [10, 10], 20))
test('Pass multiple batches where a > b [54, 12]', t => loopTest(t, [54, 12]))
test('Pass multiple batches where a = b [40, 40]', t => loopTest(t, [40, 40]))

const loopTest = async (t, [a, b], limit = 20) => {

  const notesToDispense = optimizeDispense([a, b], limit)
  const initialParams = Promise.resolve({
    batchAmount: notesToDispense.length,
    currentBatch: 1,
    dispenseRecords: [
      { dispensed: 0, rejected: 0 }, { dispensed: 0, rejected: 0 }
    ]
  })

  const batches = notesToDispense.reduce((acc, notes) => acc.then(async it => {
    const next = Brain.prototype._batchDispense.apply(thisArg, [notes, it])
    const { batch, dispenseRecords, currentBatch: nextBatch, error } = await next;
    t.falsy(error, 'No error should happen')
    if (nextBatch <= Math.ceil(a / limit)) {
      // ceil batch is the first one to have a mixture of a and b
      // i.e. all batches before ceil, have limit amount of a and 0 amount of b
      t.deepEqual(batch, [{ dispensed: limit, rejected: 0 }, { dispensed: 0, rejected: 0 }], 'Current batch dispenses limit amount of a and 0 b');
      t.deepEqual(dispenseRecords, [{ dispensed: limit * (nextBatch - 1), rejected: 0 }, { dispensed: 0, rejected: 0 }], 'Cumulative dispensed includes no b');
    }
    else if (nextBatch === 1 + Math.ceil(a / limit)) {
      // a - (limit * (currentBatch - 1))
      // total amount of a to be dispensed, minus cumulative a dispensed up to the previous batch
      const lastA = a % limit || limit
      const firstB = Math.min(b, limit - lastA)

      t.deepEqual(batch, [{ dispensed: lastA, rejected: 0 }, { dispensed: firstB, rejected: 0 }], 'Current batch dispenses residual amount of a and compliments with b');
      t.deepEqual(dispenseRecords, [{ dispensed: a, rejected: 0 }, { dispensed: firstB, rejected: 0 }], 'All a already dispensed, but only first b');
    } else if (nextBatch <= notesToDispense.length) {
      // given that this is not the lastBatch, limit amount of b must be dispensed (also 0 amount of a)
      const lastA = a % limit || limit
      const firstB = Math.min(b, limit - lastA)
      t.deepEqual(batch, [{ dispensed: 0, rejected: 0 }, { dispensed: limit, rejected: 0 }], 'Current batch dispenses limit amount of b; no a');
      t.deepEqual(dispenseRecords, [{ dispensed: a, rejected: 0 }, { dispensed: firstB + limit * (nextBatch - 1 - Math.ceil(a / limit)), rejected: 0 }], 'All a already dispensed, but only first b + a few limit batches of b');
    } else if (a + b > limit) {
      // last batch
      // corner case: 
      // when limit > a + b (i.e. there is only one batch), lastB makes no sense 
      const lastA = a % limit || limit
      const fB = Math.min(b, limit - lastA)
      const lastB = (b - fB) % limit || limit
      t.deepEqual(batch[1], { dispensed: lastB, rejected: 0 }, 'Last batch dispenses correct amount of b');
    }

    return Promise.resolve(next)
  }), initialParams)


  const { dispenseRecords, error } = await batches
  t.falsy(error, 'No error should happen')
  t.deepEqual(dispenseRecords, [{ dispensed: a, rejected: 0 }, { dispensed: b, rejected: 0 }], 'Cumulative dispensed is as expected');
}