const _ = require('lodash/fp')

const idCardData = require('./flows/id-card-data')
const idCardPhoto = require('./flows/id-card-photo')
const sanctions = require('./flows/sanctions')
const facephoto = require('./flows/facephoto')

module.exports = { run, requiredTiers, dispatch, dailyLimitReached }

const TIERS = [
  'sms',
  'idCardData',
  'sanctions',
  'idCardPhoto',
  'frontCamera'
]

function requiredTierBuilder (trader, dailyVolume) {
  return (tier) => {
    const activeKey = `${tier}VerificationActive`
    const thresholdKey = `${tier}VerificationThreshold`

    return trader[activeKey] &&
    dailyVolume.gt(trader[thresholdKey])
  }
}

function dailyLimitReached (trader, dailyVolume) {
  const requiredTier = requiredTierBuilder(trader, dailyVolume)
  return requiredTier('sms') && requiredTier('hardLimit')
}

function requiredTiers (trader, dailyVolume) {
  const requiredTier = requiredTierBuilder(trader, dailyVolume)
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
    case 'idCardPhoto':
      return idCardPhoto
    case 'sanctions':
      return sanctions
    case 'frontCamera':
      return facephoto
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
