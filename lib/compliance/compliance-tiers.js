const _ = require('lodash/fp')

const { REQUIREMENTS } = require('./triggers/consts')

const idCardData = require('./flows/id-card-data')
const idCardPhoto = require('./flows/id-card-photo')
const sanctions = require('./flows/sanctions')
const facephoto = require('./flows/facephoto')
const block = require('./flows/block')
const suspend = require('./flows/suspend')
const usSsn = require('./flows/US-SSN')

module.exports = { run, dispatch}

function pick (tier) {
  switch (tier) {
    case REQUIREMENTS.BLOCK:
      return block
    case REQUIREMENTS.SUSPEND:
      return suspend
    case REQUIREMENTS.ID_CARD_DATA:
      return idCardData
    case REQUIREMENTS.ID_CARD_PHOTO:
      return idCardPhoto
    case REQUIREMENTS.SANCTIONS:
      return sanctions
    case REQUIREMENTS.FACEPHOTO:
      return facephoto
    case REQUIREMENTS.US_SSN:
      return usSsn
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
