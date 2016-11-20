const Haikunator = require('haikunator')
const pair = require('../lib/pair')

const haikunator = new Haikunator()
const name = haikunator.haikunate({tokenLength: 0})

pair.totem('localhost', name)
.then(r => {
  console.log(r)
  process.exit(0)
})
.catch(e => {
  console.log(e)
  process.exit(1)
})

