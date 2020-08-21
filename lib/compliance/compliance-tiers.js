const _ = require('lodash/fp')

const { REQUIREMENTS } = require('./triggers/consts')

const idCardData = require('./flows/id-card-data')
const idCardPhoto = require('./flows/id-card-photo')
const sanctions = require('./flows/sanctions')
const facephoto = require('./flows/facephoto')
const block = require('./flows/block')
const suspend = require('./flows/suspend')

module.exports = { run, dispatch}

// ordered tiers
const TIERS = [
  REQUIREMENTS.PHONE_NUMBER,
  REQUIREMENTS.BLOCK,
  REQUIREMENTS.SUSPEND,
  REQUIREMENTS.ID_CARD_DATA,
  REQUIREMENTS.SANCTIONS,
  REQUIREMENTS.ID_CARD_PHOTO,
  REQUIREMENTS.FACEPHOTO
]

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
