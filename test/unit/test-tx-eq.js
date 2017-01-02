import test from 'ava'
import BigNumber from 'bignumber.js'

import Tx from '../../lib/tx'

function BN (s) {
  return new BigNumber(s)
}

test('extra params', t => {
  t.false(Tx.eq({id: 'xx'}, {id: 'xx', x: 1}))
})

test('same id', t => {
  t.true(Tx.eq({id: 'xx'}, {id: 'xx'}))
})

test('different id', t => {
  t.false(Tx.eq({id: 'xx'}, {id: 'xy'}))
})

test('different id', t => {
  t.false(Tx.eq({id: 'xx'}, {id: 'xy'}))
})

test('no id', t => {
  t.false(Tx.eq({}, {}))
})

test('blank id', t => {
  t.false(Tx.eq({id: ''}, {id: ''}))
})

test('different cryptoAtoms', t => {
  t.false(Tx.eq({id: 'xx', cryptoAtoms: BN('23.34')}, {id: 'xx', cryptoAtoms: BN('23.340001')}))
})

test('same cryptoAtoms', t => {
  t.true(Tx.eq({id: 'xx', cryptoAtoms: BN('23.340001')}, {id: 'xx', cryptoAtoms: BN('23.340001')}))
})

test('different misc value', t => {
  t.false(Tx.eq({id: 'xx', x: 1}, {id: 'xx', x: 2}))
})

test('same misc value', t => {
  t.true(Tx.eq({id: 'xx', x: 1}, {id: 'xx', x: 1}))
})

test('same bills', t => {
  t.true(Tx.eq({id: 'xx', bills: []}, {id: 'xx', bills: []}))
})

test('same bills', t => {
  t.true(Tx.eq(
    {id: 'xx', bills: [{id: 'yy', cryptoCode: 'USD', fiat: BN(1), cryptoAtoms: BN('0.1')}]},
    {id: 'xx', bills: [{id: 'yy', cryptoCode: 'USD', fiat: BN(1), cryptoAtoms: BN('0.1')}]}
  ))
})

test('different bills', t => {
  t.false(Tx.eq(
    {id: 'xx', bills: [{id: 'yy', cryptoCode: 'USD', fiat: BN(1), cryptoAtoms: BN('0.1')}]},
    {id: 'xx', bills: [{id: 'yz', cryptoCode: 'USD', fiat: BN(1), cryptoAtoms: BN('0.1')}]}
  ))
})

test('second missing id bills', t => {
  t.false(Tx.eq(
    {id: 'xx', bills: [{id: 'yy', cryptoCode: 'USD', fiat: BN(1), cryptoAtoms: BN('0.1')}]},
    {id: 'xx', bills: [{cryptoCode: 'USD', fiat: BN(1), cryptoAtoms: BN('0.1')}]}
  ))
})

test('both missing id bills', t => {
  t.false(Tx.eq(
    {id: 'xx', bills: [{cryptoCode: 'USD', fiat: BN(1), cryptoAtoms: BN('0.1')}]},
    {id: 'xx', bills: [{cryptoCode: 'USD', fiat: BN(1), cryptoAtoms: BN('0.1')}]}
  ))
})
