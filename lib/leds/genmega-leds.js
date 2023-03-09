const _ = require('lodash/fp')
const genmega = require('genmega')

const COLORS = {}

const DEVICES = {
  'cdu': 4
}

const ACTION_TYPE = {
  'pulse': 0,
  'solid': 2
}
// TODO: move to machine config file
const SERIAL_PORT = 'foo'

module.exports = { lightUp, lightDown, timed, COLORS }

function lightUp (opts) {
  genmega.SIULightUp(SERIAL_PORT, DEVICES[opts.device], ACTION_TYPE[opts.type])
}

function lightDown () {
  genmega.SIULightDown()
}

function timed () {
  return _.noop
}
