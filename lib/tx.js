const _ = require('lodash/fp')
const uuid = require('uuid')
const BN = require('./bn')

const BillMath = require('./bill_math')

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

// This function rounds precision so that the displayed amount matches
// amount actually sent.
function truncateCrypto (cryptoAtoms, cryptoCode) {
  const scale = coins[cryptoCode].displayScale
  const scaleFactor = BN(10).pow(scale)

  return BN(cryptoAtoms).truncated().div(scaleFactor)
  .round(DECIMAL_PLACES).times(scaleFactor)
}

function txMerger (oldValue, newValue, key, tx) {
  const cryptoCode = tx.cryptoCode
  if (key === 'bills') return _.unionBy(_.get('id'), oldValue, newValue)
  if (key === 'fiat') return oldValue.add(newValue)
  if (key === 'cryptoAtoms') return truncateCrypto(oldValue.add(newValue), cryptoCode)
  return
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

function update (oldTx, updateTx) {
  return _.mergeWith(txMerger, oldTx, updateTx)
}

function billUpdate (bill) {
  if (!bill) return {}

  return {
    cryptoAtoms: bill.cryptoAtoms,
    fiat: bill.fiat,
    bills: [bill]
  }
}

function createBill (bill, exchangeRate, tx) {
  const cryptoCode = tx.cryptoCode
  const unitScale = coins[cryptoCode].unitScale
  const unitScaleFactor = BN(10).pow(unitScale)
  const cryptoAtoms = truncateCrypto(BN(bill).div(exchangeRate).mul(unitScaleFactor), cryptoCode)
  const fiatCode = tx.fiatCode
  const deviceTime = Date.now()

  return {
    id: uuid.v4(),
    fiat: BN(bill),
    fiatCode,
    cryptoAtoms,
    cryptoCode,
    deviceTime,
    cashInTxsId: tx.id
  }
}

function computeCashOut (tx, cassettes, virtualCassettes, txLimit) {
  const denominationIsAvailable = denom =>
    !!BillMath.makeChange(cassettes, tx.fiat.add(denom))

  const denominationUnderLimit = denom => tx.fiat.add(denom).lte(txLimit)

  const denominationIsActive = _.overEvery([denominationUnderLimit, denominationIsAvailable])
  const denoms = _.union(virtualCassettes, _.map(_.get('denomination'), cassettes))
  const activeMap = _.zipObject(denoms.map(r => r.toNumber()), _.map(denominationIsActive, denoms))
  const noMore = !_.some(_.identity, _.values(activeMap))
  const txLimitReached = noMore && _.some(denominationIsAvailable, denoms)
  const isEmpty = noMore && !txLimitReached

  return {isEmpty, txLimitReached, activeMap}
}

function addCash (denomination, exchangeRate, tx) {
  const cryptoCode = tx.cryptoCode
  const unitScale = coins[cryptoCode].unitScale
  const unitScaleFactor = BN(10).pow(unitScale)
  const fiat = BN(denomination)
  const cryptoAtoms = truncateCrypto(fiat.div(exchangeRate).mul(unitScaleFactor), cryptoCode)

  return update(tx, {fiat, cryptoAtoms})
}

function newTx () {
  const deviceTime = Date.now()

  return {
    id: uuid.v4(),
    fiat: BN(0),
    cryptoAtoms: BN(0),
    bills: [],
    deviceTime
  }
}

module.exports = {
  newTx,
  update,
  billUpdate,
  createBill,
  eq,
  coins,
  truncateCrypto,
  addCash,
  computeCashOut
}
