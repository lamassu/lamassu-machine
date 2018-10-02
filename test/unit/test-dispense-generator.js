import BigNumber from 'bignumber.js'
import test from 'ava'
import sinon from 'sinon';
import dispenseGenerator from '../../lib/dispense-generator'
import actionEmitter from '../../lib/action-emitter'

function BN (s) {
  return new BigNumber(s)
}

let spy
const tx = {
  id: '80b34dde', 
  cryptoAtoms: BN(30600000), 
  fiat: BN(30), 
  cryptoCode: 'BTC', bills: [
    { provisioned: 0,
      denomination: 20,
      id: 'a1b2c041-60ec-4a1c-b8d1-8ae65dfb0548' },
    { provisioned: 1,
      denomination: 30,
      id: '0c4dd58a-8dee-43fa-8205-8fa1cfb5374f' } ]
}
const txId = '80b34dde'
const bills = { bills: [ { dispensed: 0, rejected: 0 }, { dispensed: 1, rejected: 0 } ] }

test.beforeEach(() => {
  spy = sinon.spy()
  actionEmitter.on('dispenseGenerator', spy)
})

test('Should emit completed action', t => {
  const g = dispenseGenerator([[0,1]], tx, txId)
  actionEmitter.emit('billDispenser', { action: 'dispensed', value: bills })
  t.true(spy.lastCall.args[0].action === 'completed')
})
