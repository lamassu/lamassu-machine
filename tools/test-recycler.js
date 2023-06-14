const child_process = require('child_process')
const _ = require('lodash/fp')
const BN = require('../lib/bn')

const childProcesses = []

const device = process.argv[2]
const debugMode = process.argv[3] ? true : false

const ENTER_KEY_CODE = 10

const waitForKey = keyCode => {
  return new Promise(resolve => {
    process.stdin.on('data', function (chunk) {
      if (chunk[0] === keyCode) {
        resolve();
        process.stdin.pause();
      }
    });
  });
}

if (!device) {
  console.log('Usage: node test-recycler.js <device> <debug_mode>')
  process.exit(2)
}

console.log('Connecting to: %s', device)

const cassettesConfig = [
  { denomination: 1.0, count: 0 },
  { denomination: 5.0, count: 0 },
  { denomination: 10.0, count: 0 },
  { denomination: 20.0, count: 0 }
]

const recycler = device === 'gsr50'
  ? require('../lib/gsr50/gsr50').factory({})
  : require('../lib/hcm2/hcm2').factory({})

if (device === 'gsr50') {
  const GSR50_PATH = '/usr/local/lib/fujitsu-gsr50/FujitsuGSR50'
  console.log('Initializing GSR50 interface...')

  const gsr50Interface = child_process.spawn(GSR50_PATH, [], { shell: true })
  childProcesses.push(gsr50Interface)

  if (debugMode) {
    gsr50Interface.stdout.on('data', (data) => console.log(data.toString()))
    gsr50Interface.stderr.on('data', (data) => console.log(data.toString()))
  }
}

process.on('exit', function() {
  console.log(`Killing ${childProcesses.length} processes...`)
  childProcesses.forEach(it => it.kill())
})

recycler.run(() => {}, cassettesConfig)
  .then(() => console.log('Recycler started. Place USD bills in the cash slot and then press ENTER in your keyboard to proceed with the deposit'))
  .then(() => waitForKey(ENTER_KEY_CODE))
  .then(() => recycler.cashCount())
  .then(list => {
    console.log(`Bills inserted (${list}). Press ENTER in your keyboard to proceed with the dispense of the bills`)
    return list
  })
  .then(list => waitForKey(ENTER_KEY_CODE).then(() => list))
  .then(list => {
    const groupedList = _.groupBy(it => it.denomination, list)
    const notesToDispense = []
    _.forEach(it => notesToDispense.push(groupedList[it.denomination]), cassettesConfig)
    return recycler.dispense(notesToDispense)
  })
