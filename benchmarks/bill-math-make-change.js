const Benchmark = require('benchmark')

const BN = require('../lib/bn')
const BillMath = require('../lib/bill_math')

const cartridges = [
  {denomination: BN(20), count: 500},
  {denomination: BN(100), count: 400}
]

const suite = new Benchmark.Suite()

suite.add('makeChange', () => BillMath.makeChange(cartridges, BN(49860)))
.on('cycle', event => console.log(String(event.target)))
.on('complete', function () { console.log('Fastest is ' + this.filter('fastest').map('name')) })
.run({async: true})
