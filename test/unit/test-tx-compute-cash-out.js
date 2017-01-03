import test from 'ava'

import BN from '../../lib/bn'
import Tx from '../../lib/tx'

test('t1', t => {
  const tx = {
    fiat: BN(35)
  }

  const cartridges = [
    {denomination: BN(5), count: 3},
    {denomination: BN(10), count: 3}
  ]

  const virtualCartridges = [BN(50)]

  const txLimit = BN(200)

  const r = Tx.computeCashOut(tx, cartridges, virtualCartridges, txLimit)

  t.deepEqual(r, {
    isEmpty: false,
    txLimitReached: false,
    activeMap: {
      5: true,
      10: true,
      50: false
    }
  })
})

test('past limit', t => {
  const tx = {
    fiat: BN(35)
  }

  const cartridges = [
    {denomination: BN(5), count: 3},
    {denomination: BN(10), count: 3}
  ]

  const virtualCartridges = [BN(50)]

  const txLimit = BN(35)

  const r = Tx.computeCashOut(tx, cartridges, virtualCartridges, txLimit)

  t.deepEqual(r, {
    isEmpty: false,
    txLimitReached: true,
    activeMap: {
      5: false,
      10: false,
      50: false
    }
  })
})

test('out of bills', t => {
  const tx = {
    fiat: BN(15)
  }

  const cartridges = [
    {denomination: BN(5), count: 1},
    {denomination: BN(10), count: 1}
  ]

  const virtualCartridges = [BN(50)]

  const txLimit = BN(10)

  const r = Tx.computeCashOut(tx, cartridges, virtualCartridges, txLimit)

  t.deepEqual(r, {
    isEmpty: true,
    txLimitReached: false,
    activeMap: {
      5: false,
      10: false,
      50: false
    }
  })
})

test('past limit and out of bills', t => {
  const tx = {
    fiat: BN(60)
  }

  const cartridges = [
    {denomination: BN(20), count: 3},
    {denomination: BN(50), count: 1}
  ]

  const virtualCartridges = [BN(100)]

  const txLimit = BN(100)

  const r = Tx.computeCashOut(tx, cartridges, virtualCartridges, txLimit)

  t.deepEqual(r, {
    isEmpty: false,
    txLimitReached: true,
    activeMap: {
      20: false,
      50: false,
      100: false
    }
  })
})

test('not past limit nor empty', t => {
  const tx = {
    fiat: BN(90)
  }

  const cartridges = [
    {denomination: BN(20), count: 3},
    {denomination: BN(50), count: 1}
  ]

  const virtualCartridges = [BN(100)]

  const txLimit = BN(200)

  const r = Tx.computeCashOut(tx, cartridges, virtualCartridges, txLimit)

  t.deepEqual(r, {
    isEmpty: false,
    txLimitReached: false,
    activeMap: {
      20: true,
      50: false,
      100: false
    }
  })
})
