const _ = require('lodash/fp')

const idCardData = require('./flows/id-card-data')
const sanctions = require('./flows/sanctions')

module.exports = {run, requiredTiers, dispatch}

const TIERS = [
  'sms',
  'hardLimit',
  'idCardData',
  'sanctions',
  'idCardPhoto'
]

function requiredTiers (trader, dailyVolume) {
  function requiredTier (tier) {
    const activeKey = `${tier}VerificationActive`
    const thresholdKey = `${tier}VerificationThreshold`

    return trader[activeKey] &&
    dailyVolume.gt(trader[thresholdKey])
  }

  const _required = _.filter(requiredTier, TIERS)

  // Ensure that we always start with sms if any tiers required
  return _.isEmpty(_required)
    ? []
    : _.union(['sms'], _required)
}

function pick (tier) {
  switch (tier) {
    case 'idCardData':
      return idCardData
    case 'sanctions':
      return sanctions
    default:
      throw new Error(`Unsupported tier: ${tier}`)
  }
}

function run (tier) {
  return pick(tier).start()
}

function dispatch (tier, event) {
  return pick(tier).dispatch(event)
}
