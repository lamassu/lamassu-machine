const _ = require('lodash/fp')
const BN = require('../../bn')

const { TRIGGER_TYPES, REQUIREMENTS, DIRECTIONS } = require('./consts')

const filterSinceThreshold = days => _.filter(it => daysSince(it.created) < days)
const filterNoFiatTx = _.filter(it => BN(0).lt(it.fiat || 0))

function hasTriggered (trigger, history, tx) {
  if (tx.direction !== trigger.direction && trigger.direction !== DIRECTIONS.BOTH) {
    return false
  }

  const txHistory = _.isEmpty(history) ? [] : history

  switch (trigger.triggerType) {
    case TRIGGER_TYPES.TRANSACTION_AMOUNT:
      return transactionAmount(trigger, tx.fiat)
    case TRIGGER_TYPES.TRANSACTION_VOLUME:
      return transactionVolume(trigger, txHistory, tx.fiat)
    case TRIGGER_TYPES.TRANSACTION_VELOCITY:
      return transactionVelocity(trigger, txHistory)
    case TRIGGER_TYPES.CONSECUTIVE_DAYS:
      return consecutiveDays(trigger, txHistory)
  }
}

function transactionAmount (trigger, amount) {
  return amount > trigger.threshold
}

function getTxVolume (trigger, txHistory, amount) {
  const history = _.concat(txHistory)({ fiat: amount, created: new Date() })
  const { thresholdDays } = trigger

  const total = _.compose(
    _.reduce((previous, curr) => previous.plus(curr), BN(0)),
    _.map('fiat'),
    filterSinceThreshold(thresholdDays)
  )(history)

  return total
}

function transactionVolume (trigger, txHistory, amount) {
  const { threshold } = trigger
  const total = getTxVolume(trigger, txHistory, amount)
  return total > threshold
}

function transactionVelocity (trigger, txHistory) {
  const { threshold, thresholdDays } = trigger

  const txAmount = _.compose(_.size, filterSinceThreshold(thresholdDays), filterNoFiatTx)(txHistory)
  return txAmount >= threshold
}

function consecutiveDays (trigger, txHistory) {
  const { thresholdDays } = trigger

  const dailyQuantity = _.compose(_.countBy(daysSince), _.map('created'), filterNoFiatTx)(txHistory)
  const hasPassed = _.every(it => dailyQuantity[it])(_.range(1, thresholdDays))

  return hasPassed
}

function daysSince (created) {
  let now = new Date();
  now.setHours(0, 0, 0, 0)
  
  let then = new Date(created)
  then.setHours(0, 0, 0, 0)

  return Math.round((now-then) / (1000*60*60*24))
}

function getTriggered (triggers, history, tx) {
  return _.filter(it => hasTriggered(it, history, tx))(triggers)
}

function getAmountToHardLimit (triggers, history, tx) {
  const filterByHardLimit = _.filter(({ requirement }) =>
    requirement === REQUIREMENTS.BLOCK || requirement === REQUIREMENTS.SUSPEND
  )

  const filterByDirection = _.filter(({ direction }) =>
    tx.direction === direction || direction === DIRECTIONS.BOTH
  )

  const groupedTriggers = _.compose(_.groupBy('triggerType'), filterByHardLimit, filterByDirection)(triggers)

  const filteredAmount = groupedTriggers[TRIGGER_TYPES.TRANSACTION_AMOUNT]
  const filteredVolume = groupedTriggers[TRIGGER_TYPES.TRANSACTION_VOLUME]

  const minAmount = _.min(_.map(it => it.threshold - tx.fiat)(filteredAmount))
  const minVolume = _.min(_.map(it => it.threshold - getTxVolume(it, history, tx.fiat))(filteredVolume))
  const amount = _.min([minAmount, minVolume])
  return _.isNil(amount) ? BN(Infinity) : BN(amount)
}

function getLowestAmountPerRequirement (triggers) {
  const types = [ TRIGGER_TYPES.TRANSACTION_AMOUNT, TRIGGER_TYPES.TRANSACTION_VOLUME ]

  const filter = _.filter(({ triggerType }) => _.includes(triggerType)(types))
  const mapValues = _.mapValues(_.compose(_.min, _.map('threshold'), filter))

  return _.compose(mapValues, _.groupBy('requirement'))(triggers)
}

module.exports = {
  getTriggered,
  getAmountToHardLimit,
  getLowestAmountPerRequirement
}
