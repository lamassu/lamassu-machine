import test from 'ava'
import BigNumber from 'bignumber.js'

import Tx from '../../lib/tx'

function BN (s) {
  return new BigNumber(s)
}

test('simple add', t => {
  const rate = BN(1000)

  t.true(Tx.eq(Tx.addCash(BN(5), rate, {id: 'xx', cryptoAtoms: BN(0), fiat: BN(0), cryptoCode: 'BTC'}),
    {id: 'xx', cryptoAtoms: BN(500000), fiat: BN(5), cryptoCode: 'BTC'})
  )
})

test('add to existing', t => {
  const rate = BN(1000)

  t.true(Tx.eq(Tx.addCash(BN(10), rate, {id: 'xx', cryptoAtoms: BN(500000), fiat: BN(5), cryptoCode: 'BTC'}),
    {id: 'xx', cryptoAtoms: BN(1500000), fiat: BN(15), cryptoCode: 'BTC'})
  )
})
