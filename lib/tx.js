const _ = require('lodash/fp')
const uuid = require('uuid')

const BN = require('./bn')
const { utils: coinUtils } = require('@lamassu/coins')
const BillMath = require('./bill_math')

const DECIMAL_PLACES = 6

// This function rounds precision so that the displayed amount matches
// amount actually sent.
function truncateCrypto (cryptoAtoms, cryptoCode) {
  if (cryptoAtoms.eq(0)) return cryptoAtoms

  const scale = coinUtils.getCryptoCurrency(cryptoCode).unitScale
  const scaleFactor = BN(10).pow(scale)

  return BN(cryptoAtoms).truncated().div(scaleFactor)
    .round(DECIMAL_PLACES).times(scaleFactor)
}

function mergeTx (oldTx, updateTx) {
  const bills = _.unionBy(_.get('id'), oldTx.bills, updateTx.bills)
  const cryptoCode = oldTx.cryptoCode
  const mergedTx = _.defaults(oldTx, updateTx)
  const fee = BN(mergedTx.cashInFee || mergedTx.fixedFee || 0)

  const cashInNewFields = () => ({
    bills,
    fiat: updateTx.fiat ? oldTx.fiat.add(updateTx.fiat) : oldTx.fiat,
    cryptoAtoms: truncateCrypto(
      _.reduce((acc, v) => acc.add(toCrypto(mergedTx, BN(v.fiat).minus(v.cashInFee))), BN(0), bills),
      cryptoCode),
    cashInFeeCrypto: truncateCrypto(toCrypto(mergedTx, fee), cryptoCode)
  })

  const cashOutNewFields = () => ({
    fiat: oldTx.fiat.add(updateTx.fiat || 0),
    cryptoAtoms: truncateCrypto(toCrypto(mergedTx, oldTx.fiat.add(updateTx.fiat || 0).add(fee)), cryptoCode),
    fixedFee: fee,
    fixedFeeCrypto: truncateCrypto(toCrypto(mergedTx, fee), cryptoCode),
  })

  var newFields
  if (oldTx.direction === 'cashIn') {
    newFields = cashInNewFields()
  } else if (oldTx.direction === 'cashOut') {
    newFields = cashOutNewFields()
  }
  return _.assignAll([oldTx, updateTx, newFields])
}

function getExchangeRate (tx) {
  const cryptoCode = tx.cryptoCode
  const exchangeRate = getRates(tx)[cryptoCode][tx.direction]
  const unitScale = coinUtils.getCryptoCurrency(cryptoCode).unitScale
  const unitScaleFactor = BN(10).pow(unitScale)

  return exchangeRate.div(unitScaleFactor)
}

function toCrypto (tx, value) {
  return truncateCrypto(value.div(getExchangeRate(tx)), tx.cryptoCode)
}

function getRates (tx) {
  const cryptoCode = tx.cryptoCode
  if (!cryptoCode) return {}

  const direction = tx.direction
  const isCashIn = direction === 'cashIn'
  const tickerPrice = tx.rawTickerPrice ? BN(tx.rawTickerPrice) : BN(0)
  const commission = getCommissionPercentage(tx.discount, tx.commissionPercentage, isCashIn)

  return {
    [cryptoCode]: {
      [direction]: tickerPrice.mul(commission).round(5)
    }
  }
}

function getCommissionPercentage (discount, commission, isCashIn) {
  discount = discount ? BN(discount) : BN(0)
  commission = commission ? BN(commission) : BN(0)

  discount = BN(1).sub(discount.div(100))
  commission = commission.mul(discount)

  return isCashIn
    ? BN(1).add(commission)
    : BN(1).sub(commission)
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
  }
}

function eq (a, b) {
  return _.isEqualWith(isTxEq, a, b)
}

function update (oldTx, updateTx) {
  const newTx = mergeTx(oldTx, updateTx)
  const dirty = newTx.dirty || !eq(oldTx, newTx)
  const txVersion = newTx.txVersion + 1

  return _.assign(newTx, {dirty, txVersion})
}

function billUpdateMultiple (bills) {
  if (!bills) return {}

  return {
    fiat: _.reduce((acc, value) => acc.add(value.fiat), BN(0), bills),
    bills: bills
  }
}

function billUpdate (bill) {
  if (!bill) return {}

  return {
    fiat: bill.fiat,
    bills: [bill]
  }
}

function createBill (bill, tx) {
  const applyCashInFee = _.isEmpty(tx.bills)
  const fiatCode = tx.fiatCode
  const cashInFee = applyCashInFee ? tx.cashInFee : BN(0)
  const deviceTime = Date.now()

  return {
    id: uuid.v4(),
    fiat: BN(bill),
    fiatCode,
    cryptoCode: tx.cryptoCode,
    cashInFee,
    cashInTxsId: tx.id,
    deviceTime
  }
}

function computeCashOut (tx, cassettes, virtualCassettes, txLimit) {
  const denominationIsAvailable = denom =>
    !!BillMath.makeChange(cassettes, tx.fiat.add(denom))

  const denominationUnderLimit = denom => BN(denom).lte(txLimit)

  const denominationIsActive = _.overEvery([denominationUnderLimit, denominationIsAvailable])
  const denoms = _.union(virtualCassettes, _.map(_.get('denomination'), cassettes))
  const activeMap = _.zipObject(denoms.map(r => r.toNumber()), _.map(denominationIsActive, denoms))
  const noMore = !_.some(_.identity, _.values(activeMap))
  const txLimitReached = noMore && _.some(denominationIsAvailable, denoms)
  const isEmpty = noMore && !txLimitReached

  return {isEmpty, txLimitReached, activeMap}
}

function addCash (denomination, tx) {
  const fiat = BN(denomination)

  return update(tx, { fiat })
}

function newTx () {
  return {
    id: uuid.v4(),
    fiat: BN(0),
    cryptoAtoms: BN(0),
    bills: [],
    dirty: true,
    termsAccepted: false,
    txVersion: 0
  }
}

module.exports = {
  newTx,
  update,
  billUpdateMultiple,
  billUpdate,
  createBill,
  eq,
  truncateCrypto,
  addCash,
  computeCashOut,
  getRates
}
