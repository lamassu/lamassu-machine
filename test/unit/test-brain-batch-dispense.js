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

  const { dispenseRecords, error } = await Brain.prototype._batchDispense.apply(thisArg, [notesToDispense, initialParams])
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

  const { dispenseRecords, error } = await Brain.prototype._batchDispense.apply(thisArg, [notesToDispense, initialParams])
  t.falsy(error, 'No error should happen')
  t.deepEqual(dispenseRecords, [{ dispensed: 0, rejected: 0 }, { dispensed: 20, rejected: 0 }], 'Dispenses all 20 notes on first batch');
})
