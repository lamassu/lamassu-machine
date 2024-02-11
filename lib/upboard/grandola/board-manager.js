const ledManager = require('./led-manager')

module.exports = { run }

function run () {
  return ledManager.run()
}
