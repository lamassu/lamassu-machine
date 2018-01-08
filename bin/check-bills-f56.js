const f56 = require('../lib/f56/f56-rs232')

if (process.argv.length !== 5) {
  console.log('Usage: node bin/check-bills-f56.js <serial device>')
  console.log('Ex: node bin/check-bills-f56.js /dev/ttyUSB0')
  process.exit(2)
}

f56.create(process.argv[2])
.then(() => setInterval(f56.billsPresent, 2000))
