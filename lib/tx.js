const _ = require('lodash/fp')
const uuid = require('uuid')

const BN = require('./bn')
const coinUtils = require('./coins/utils')
const BillMath = require('./bill_math')

const DECIMAL_PLACES = 3

const coins = coinUtils.coins

// This function rounds precision so that the displayed amount matches
// amount actually sent.
function truncateCrypto (cryptoAtoms, cryptoCode) {
  if (cryptoAtoms.eq(0)) return cryptoAtoms

  const scale = coins[cryptoCode].displayScale
  const scaleFactor = BN(10).pow(scale)

  return BN(cryptoAtoms).truncated().div(scaleFactor)
    .round(DECIMAL_PLACES).times(scaleFactor)
}

function mergeTx (oldTx, updateTx) {
  const bills = _.unionBy(_.get('id'), oldTx.bills, updateTx.bills)
  const cryptoCode = oldTx.cryptoCode

  const cashInNewFields = () => ({
    bills,
    fiat: updateTx.fiat ? oldTx.fiat.add(updateTx.fiat) : oldTx.fiat,
    cryptoAtoms: truncateCrypto(_.reduce((acc, v) => acc.add(v.cryptoAtomsAfterFee), BN(0), bills), cryptoCode),
    cashInFeeCrypto: _.reduce((acc, v) => acc.add(v.cashInFeeCrypto), BN(0), bills)
  })

  const cashOutNewFields = () => ({
    fiat: oldTx.fiat.add(updateTx.fiat || 0),
    cryptoAtoms: truncateCrypto(oldTx.cryptoAtoms.add(updateTx.cryptoAtoms || 0), cryptoCode)
  })

  const newFields = oldTx.direction === 'cashIn'
    ? cashInNewFields()
    : cashOutNewFields()

  return _.assignAll([oldTx, updateTx, newFields])
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

function billUpdate (bill) {
  if (!bill) return {}

  return {
    cryptoAtoms: bill.cryptoAtoms,
    fiat: bill.fiat,
    bills: [bill]
  }
}

function createBill (bill, exchangeRate, tx) {
  const applyCashInFee = _.isEmpty(tx.bills)
  const cryptoCode = tx.cryptoCode
  const unitScale = coins[cryptoCode].unitScale
  const unitScaleFactor = BN(10).pow(unitScale)
  const atomRate = exchangeRate.div(unitScaleFactor)
  const fiatCode = tx.fiatCode
  const cashInFee = applyCashInFee ? tx.cashInFee : BN(0)
  const cashInFeeCrypto = truncateCrypto(cashInFee.div(atomRate), cryptoCode)
  const cryptoAtoms = truncateCrypto(BN(bill).div(atomRate), cryptoCode)
  const cryptoAtomsAfterFee = truncateCrypto(cryptoAtoms.sub(cashInFeeCrypto), cryptoCode)
  const deviceTime = Date.now()

  return {
    id: uuid.v4(),
    fiat: BN(bill),
    fiatCode,
    cryptoAtoms,
    cryptoAtomsAfterFee,
    cryptoCode,
    cashInFee,
    cashInFeeCrypto,
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

function addCash (denomination, exchangeRate, tx) {
  const cryptoCode = tx.cryptoCode
  const unitScale = coins[cryptoCode].unitScale
  const unitScaleFactor = BN(10).pow(unitScale)
  const fiat = BN(denomination)
  const cryptoAtoms = truncateCrypto(fiat.div(exchangeRate).mul(unitScaleFactor), cryptoCode)

  return update(tx, {fiat, cryptoAtoms})
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
  billUpdate,
  createBill,
  eq,
  coins,
  truncateCrypto,
  addCash,
  computeCashOut
}
