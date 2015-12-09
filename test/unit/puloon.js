/* globals describe, it */

// TODO: flesh out tests

var Puloon = require('../../lib/puloon/puloonrs232')

var puloon = Puloon.factory()

var counter = 0
puloon._send = function (cmd, name, cb) {
  var accepted1 = parseInt(cmd.toString('hex').slice(8, 10), 16) - 0x20
  var accepted2 = parseInt(cmd.toString('hex').slice(10, 12), 16) - 0x20

  cb(null, {
    bills: [
      {accepted: accepted1, rejected: 0},
      {accepted: accepted2, rejected: 0}
    ],
    code: 0x34,
    name: 'dispense',
    err: counter++ > 0 ? 'fig' : null
  })
}

describe('PuloonRs232', function () {
  it('dispenses small amount', function (done) {
    puloon.dispense([45, 23], function (err, res) {
      done()
    })
  })
})
