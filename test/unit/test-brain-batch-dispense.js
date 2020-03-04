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

  const initialParams = {
    batchAmount: notesToDispense.length,
    currentBatch: 1,
    dispenseRecords: [
      { dispensed: 0, rejected: 0 }, { dispensed: 0, rejected: 0 }
    ]
  }

  const batches = notesToDispense.reduce((acc, notes) => {
    return acc.then(it => {

      const { value: batch, dispenseRecords, currentBatch, error } = it;

      if (currentBatch > 1 && currentBatch < 7) {
        t.falsy(error, 'No error should happen')
        t.deepEqual(batch, [{ dispensed: 0, rejected: 0 }, { dispensed: 20, rejected: 0 }], 'Current batch dispenses as expected');
        t.deepEqual(dispenseRecords, [{ dispensed: 0, rejected: 0 }, { dispensed: 20 * (currentBatch - 1), rejected: 0 }], 'Cumulative dispensed is as expected');
      }

      return Brain.prototype._batchDispense.apply(thisArg, [notes, it])
    })
  }, Promise.resolve(initialParams))


  const { value: lastBatch, dispenseRecords, error } = await batches
  t.falsy(error, 'No error should happen')
  t.deepEqual(lastBatch, [{ dispensed: 0, rejected: 0 }, { dispensed: 1, rejected: 0 }], 'Last batch should dispense as expected');
  t.deepEqual(dispenseRecords, [{ dispensed: 0, rejected: 0 }, { dispensed: 101, rejected: 0 }], 'Cumulative dispensed is as expected');
})
