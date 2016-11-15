const fs = require('fs')

function setup () {
  fs.writeFileSync('/sys/class/gpio/export', '65')
  fs.writeFileSync('/sys/class/gpio/direction', 'out')
}

function open () {
  fs.writeFileSync('/sys/class/gpio/gpio65/value', '1')
  setTimeout(() => fs.writeFileSync('/sys/class/gpio/gpio65/value', '0'), 1000)
}

module.exports = {
  setup,
  open
}
