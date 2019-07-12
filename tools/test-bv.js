var device = process.argv[2]

if (!device) {
  console.log('Usage: node init-bv.js <device>')
  process.exit(2)
}

console.log('Connecting to: %s', device)
const billValidator = process.argv[3] === 'ccnet' ?
  require('../lib/ccnet/ccnet')
  :
  require('../lib/id003/id003')

var config = {currency: 'EUR', rs232: {device: device}}

billValidator.on('error', function (err) { console.log(err) })
billValidator.on('disconnected', function () { console.log('Disconnnected') })
billValidator.on('billAccepted', function () { console.log('Bill accepted') })
billValidator.on('billRead', function (data) {
  console.log('Bill read: %j', data)
  id003.stack()
})
billValidator.on('billValid', function () { console.log('Bill valid') })
billValidator.on('billRejected', function () { console.log('Bill rejected') })
billValidator.on('timeout', function () { console.log('Bill timeout') })
billValidator.on('standby', function () { console.log('Standby') })
billValidator.on('jam', function () { console.log('jam') })
billValidator.on('stackerOpen', function () { console.log('Stacker open') })
billValidator.on('enabled', function (data) { console.log('Enabled') })

billValidator.run(function (err) {
  if (err) {
    console.log(err)
    process.exit(1)
  } else {
    billValidator.enable()
    console.log('success.')
  }
})
