import BigNumber from 'bignumber.js'
import test from 'ava'
import sinon from 'sinon';
import dispenseGenerator from '../../lib/dispense-generator'
import actionEmitter from '../../lib/action-emitter'

function BN (s) {
  return new BigNumber(s)
}

let spy

test.beforeEach(() => {
  spy = sinon.spy()
  actionEmitter.on('dispenseGenerator', spy)
})

test('Should complete single dispense', t => {
  const tx = {
    id: '80b34dde', 
    cryptoAtoms: BN(30600000), 
    fiat: BN(30), 
    bills: [
      { provisioned: 0,
        denomination: 20 },
      { provisioned: 1,
        denomination: 30 } ]
  }
  const txId = '80b34dde'
  const dispensedBills = { bills: [ { dispensed: 0, rejected: 0 }, { dispensed: 1, rejected: 0 } ] }
  const g = dispenseGenerator([[0,1]], tx, txId)
  actionEmitter.emit('billDispenser', { action: 'dispensed', value: dispensedBills })
  
  t.plan(7)
  t.true(spy.firstCall.args[0].action === 'updateUI')
  t.true(spy.getCall(1).args[0].action === 'dispenseBatch')
  t.true(spy.getCall(2).args[0].action === 'billDispenserDispensed')
  t.true(spy.getCall(3).args[0].action === 'fastUpdateTx')
  t.true(spy.getCall(4).args[0].action === 'transitionState')
  t.true(spy.getCall(5).args[0].action === 'billDispenserCollected')
  t.true(spy.lastCall.args[0].action === 'completed')
})

test('Should complete mulitiple dispense', t => {
  const tx = { 
    id: '78760b66',
    cryptoAtoms: BN(1295400000),
    fiat: BN(1270),
    bills: [ 
      { provisioned: 2,
        denomination: 20 },
      { provisioned: 41,
        denomination: 30 } ],
  }
  const txId = '78760b66'
  const dispensedBills1 = { bills: [ { dispensed: 2, rejected: 0 }, { dispensed: 18, rejected: 0 }, ] }
  const dispensedBills2 = { bills: [ { dispensed: 0, rejected: 0 }, { dispensed: 20, rejected: 0 }, ] }
  const dispensedBills3 = { bills: [ { dispensed: 0, rejected: 0 }, { dispensed: 3, rejected: 0 }, ] }
  
  const g = dispenseGenerator([[ 2, 18 ], [ 0, 20 ], [ 0, 3 ]], tx, txId)
  actionEmitter.emit('billDispenser', { action: 'dispensed', value: dispensedBills1 })
  actionEmitter.emit('billDispenser', { action: 'dispensed', value: dispensedBills2 })
  actionEmitter.emit('billDispenser', { action: 'dispensed', value: dispensedBills3 })

  t.plan(11)
  t.true(spy.firstCall.args[0].action === 'updateUI')
  t.true(spy.getCall(1).args[0].action === 'dispenseBatch')
  t.true(spy.getCall(2).args[0].action === 'updateUI')
  t.true(spy.getCall(3).args[0].action === 'dispenseBatch')
  t.true(spy.getCall(4).args[0].action === 'updateUI')
  t.true(spy.getCall(5).args[0].action === 'dispenseBatch')
  t.true(spy.getCall(6).args[0].action === 'billDispenserDispensed')
  t.true(spy.getCall(7).args[0].action === 'fastUpdateTx')
  t.true(spy.getCall(8).args[0].action === 'transitionState')
  t.true(spy.getCall(9).args[0].action === 'billDispenserCollected')
  t.true(spy.lastCall.args[0].action === 'completed')
})
