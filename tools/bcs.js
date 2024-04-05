const bcs = require('../lib/scanner-genmega')
const { argv } = require('node:process');
const device = argv[2]
bcs.config({ scanner: { device } })
bcs.scanMainQR('BTC', (res, err) => {
  if (res) process.exit(0)
  process.exit(1)
})
