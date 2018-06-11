const test = require('ava')
const _ = require('lodash/fp')

const BillDispenser = require('../../lib/mocks/billdispenser')

test('test mockedError', async t => {
  const fakeConfig = {
    'mockedError': {
      '0x51': [0, 4],
      '0x52': [0, 4],
      '0x54': [0, 1]
    }
  }
  const mock = BillDispenser.factory(fakeConfig)

  t.deepEqual('0x51', mock.matchMockedErrors([0, 4]))
  t.deepEqual('0x54', mock.matchMockedErrors([0, 1]))
  t.is(undefined, mock.matchMockedErrors([0, 10]))

  await t.throws(mock.dispense([0, 4]))
})

test('test mockedBalance', async t => {
  const fakeConfig = {
    'mockedBalance': {
      'cassettes': [
        {
          'count': 0
        },
        {
          'count': 0
        }
      ]
    }
  }
  const mock = BillDispenser.factory(fakeConfig)
  await mock.init({})

  await t.throws(mock.dispense([0, 4]))
})
