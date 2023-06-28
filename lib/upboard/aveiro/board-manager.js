const ledManager = require('../../ssuboard/led-manager')
const LEDS = require('./led-addresses')

module.exports = { run }

function run () {
  return ledManager.run(LEDS)
}
