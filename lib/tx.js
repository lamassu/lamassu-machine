const _ = require('lodash/fp')
const BigNumber = require('bignumber.js')
const uuid = require('uuid')

const DECIMAL_PLACES = 3

const coins = {
  BTC: {
    displayScale: 5,
    unitScale: 8,
    zeroConf: true
  },
  ETH: {
    displayScale: 15,
    unitScale: 18,
    zeroConf: false
  }
}

function BN (s) {
  return new BigNumber(s)
}

// This function rounds precision so that the displayed amount matches
// amount actually sent.
function truncateCrypto (cryptoAtoms, cryptoCode) {
  const scale = coins[cryptoCode].displayScale
  const scaleFactor = new BigNumber(10).pow(scale)

  return new BigNumber(cryptoAtoms).truncated().div(scaleFactor)
  .round(DECIMAL_PLACES).times(scaleFactor)
}

function txMerger (oldValue, newValue, key, tx) {
  const cryptoCode = tx.cryptoCode
  console.log('DEBUG33: %j', [key, oldValue, tx])
  if (key === 'bills') return _.unionBy(_.get('id'), oldValue, newValue)
  if (key === 'fiat') return oldValue.add(newValue)
  if (key === 'cryptoAtoms') return truncateCrypto(oldValue.add(newValue), cryptoCode)
}

function isBillsEq (a, b, k) {
  const required = ['id', 'cryptoCode', 'fiat', 'cryptoAtoms']
  if (_.isNumber(k)) return _.some(f => _.isEmpty(_.get(f, a)), required) ? false : undefined

  switch (k) {
    case 'fiat':
    case 'cryptoAtoms':
      return a.eq(b)
    case undefined:
      return a.length === b.length ? undefined : false
    default:
      return
  }
}

function isTxEq (a, b, k) {
  switch (k) {
    case 'bills':
      return _.isEqualWith(isBillsEq, a, b)
    case 'fiat':
    case 'cryptoAtoms':
      return a.eq(b)
    case undefined:
      return _.some(f => _.isEmpty(_.get(f, a)), ['id']) ? false : undefined
    default:
      return
  }
}

function eq (a, b) {
  return _.isEqualWith(isTxEq, a, b)
}

function update (updateTx, oldTx) {
  return _.mergeWith(txMerger, oldTx, updateTx)
}

function addBill (bill, tx) {
  if (!bill) return tx

  return update(tx, {
    cryptoAtoms: bill.cryptoAtoms,
    fiat: bill.fiat,
    bills: [bill]
  })
}

function createBill (bill, exchangeRate, tx) {
  const cryptoCode = tx.cryptoCode
  const unitScale = coins[cryptoCode].unitScale
  const unitScaleFactor = new BigNumber(10).pow(unitScale)
  const cryptoAtoms = truncateCrypto(new BigNumber(bill).div(exchangeRate).mul(unitScaleFactor), cryptoCode)

  return {
    id: uuid.v4(),
    fiat: BN(bill),
    cryptoAtoms,
    cryptoCode
  }
}

module.exports = {update, addBill, createBill, eq}
