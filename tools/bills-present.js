const f56 = require('../lib/f56/f56-rs232')

if (process.argv.length !== 3) {
  console.log('Usage: node tools/bills-present.js <serial device>')
  process.exit(2)
}

function billsPresent (f56) {
  return f56.billsPresent()
  .then(res => console.dir(res))
}

f56.create(process.argv[2])
  .then(() => {
    setInterval(() => billsPresent(f56), 500)
  })
  .catch(e => {
    console.log(e)
    process.exit(1)
  })
