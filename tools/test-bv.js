function selectBillValidatorClass (billValidator) {
  switch (billValidator) {
    case 'genmega': return require('../lib/genmega/genmega-validator/genmega-validator')
    case 'cashflowSc': return require('../lib/mei/cashflow_sc')
    case 'ccnet': return require('../lib/ccnet/ccnet')
    case 'hcm2': return require('../lib/hcm2/hcm2')
    case 'gsr50': return require('../lib/gsr50/gsr50')
    default: return require('../lib/id003/id003')
  }
}

function loadBillValidator (billValidator, config) {
  return selectBillValidatorClass(billValidator).factory(config)
}

const [billValidator, device] = process.argv.slice(2)
if (!device) {
  console.log('Usage: node init-bv.js VALIDATOR_MODEL SERIAL_DEVICE')
  process.exit(2)
}

const config = {
  rs232: { device },
  escrowEnabled: true,
  fiatCode: 'EUR',
}

console.log('Connecting to: %s', device)
const bv = loadBillValidator(billValidator, config)

bv.on('error', function (err) { console.log(err) })
bv.on('disconnected', function () { console.log('Disconnnected') })
bv.on('billsAccepted', function () { console.log('Bill accepted') })
bv.on('billsRead', function (data) {
  console.log('Bill read: %j', data)
  bv.stack()
})
bv.on('billsValid', function () { console.log('Bill valid') })
bv.on('billsRejected', function () { console.log('Bill rejected') })
bv.on('timeout', function () { console.log('Bill timeout') })
bv.on('standby', function () { console.log('Standby') })
bv.on('jam', function () { console.log('jam') })
bv.on('stackerOpen', function () { console.log('Stacker open') })
bv.on('stackerClosed', function () { console.log('Stacker closed') })
bv.on('enabled', function (data) { console.log('Enabled') })
bv.on('cashSlotRemoveBills', () => { console.log('cashSlotRemoveBills') })
bv.on('leftoverBillsInCashSlot', () => { console.log('leftoverBillsInCashSlot') })
bv.on('actionRequiredMaintenance', function () { console.log('actionRequiredMaintenance') })

bv.run(function (err) {
  if (err) {
    console.log(err)
    process.exit(1)
  } else {
    bv.enable()
    console.log('success.')
  }
})
