const _ = require('lodash/fp')
const uuid = require('uuid')

const BN = require('./bn')
const { utils: coinUtils } = require('@lamassu/coins')
const coin_change = require('./coin-change')

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

  const cashInNewFields = () => ({
    bills,
    fiat: updateTx.fiat ? oldTx.fiat.add(updateTx.fiat) : oldTx.fiat,
    cryptoAtoms: truncateCrypto(
      _.reduce((acc, v) => acc.add(toCrypto(mergedTx, BN(v.fiat).minus(v.cashInFee))), BN(0), bills),
      cryptoCode)
  })

  const cashOutNewFields = () => ({
    fiat: oldTx.fiat.add(updateTx.fiat || 0),
    cryptoAtoms: truncateCrypto(toCrypto(mergedTx, oldTx.fiat.add(updateTx.fiat || 0)), cryptoCode)
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

function billUpdate (bills) {
  if (!bills || _.isEmpty(bills)) return {}

  return {
    fiat: _.reduce((acc, value) => acc.add(value.fiat), BN(0), bills),
    bills
  }
}

function createBill (bill, tx) {
  const applyCashInFee = _.isEmpty(tx.bills)
  const fiatCode = tx.fiatCode
  const cashInFee = applyCashInFee ? tx.cashInFee : BN(0)
  const deviceTime = Date.now()
  const { destinationUnit, denomination } = bill
  if (!destinationUnit)
    throw Error("Tried to create bill without destinationUnit:", bill)

  return {
    id: uuid.v4(),
    fiat: BN(denomination),
    fiatCode,
    cryptoCode: tx.cryptoCode,
    cashInFee,
    cashInTxsId: tx.id,
    deviceTime,
    destinationUnit
  }
}

function computeCashOut (tx, units, virtualUnits, txLimit) {
  const model = coin_change.model(units.map(({ denomination, count}) => [denomination.toNumber(), count]))
  const _denomAvailable = new Map()
  const denominationIsAvailable = denom => {
    denom = denom.toNumber()
    let ret = _denomAvailable.get(denom)
    if (ret !== undefined) return ret
    const target = tx.fiat.add(denom).toNumber()
    const solution = coin_change.solve(model, target)
    ret = coin_change.check(solution, target) && !!solution
    _denomAvailable.set(denom, ret)
    return ret
  }

  const denominationUnderLimit = denom => BN(denom).lte(txLimit)
  const denominationIsActive = _.overEvery([denominationUnderLimit, denominationIsAvailable])

  const denoms = _.union(virtualUnits, _.map(_.get('denomination'), units))
  const activeMap = _.fromPairs(_.map(denom => [denom.toNumber(), denominationIsActive(denom)], denoms))
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
  billUpdate,
  createBill,
  eq,
  addCash,
  computeCashOut,
  getRates
}
