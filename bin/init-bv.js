var device = process.argv[2]

if (!device) {
  console.log('Usage: node init-bv.js <device>')
  process.exit(2)
}

console.log('Connecting to: %s', device)
var config = {currency: 'EUR', rs232: {device: device}}
var id003 = require('../lib/id003/id003').factory(config)

id003.on('error', function (err) { console.log(err) })
id003.on('disconnected', function () { console.log('Disconnnected') })
id003.on('billAccepted', function () { console.log('Bill accepted') })
id003.on('billRead', function (data) { console.log('Bill read') })
id003.on('billValid', function () { console.log('Bill valid') })
id003.on('billRejected', function () { console.log('Bill rejected') })
id003.on('timeout', function () { console.log('Bill timeout') })
id003.on('standby', function () { console.log('Standby') })
id003.on('jam', function () { console.log('jam') })
id003.on('stackerOpen', function () { console.log('Stacker open') })
id003.on('enabled', function (data) { console.log('Enabled') })

id003.run(function (err) {
  if (err) {
    console.log(err)
    process.exit(1)
  } else {
    // setTimeout(function () { id003.enable() }, 5000)
    console.log('success.')
  }
})
