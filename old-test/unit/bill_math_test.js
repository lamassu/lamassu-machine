/* globals describe, it */
var assert = require('assert')

var BillMath = require('../../lib/bill_math')

describe('BillMath', function () {
  describe('20s and 50s', function () {
    var cartridges = [
      {denomination: 20, count: 100}, {denomination: 50, count: 2}
    ]

    function assertChange (amount, expected) {
      var realExpected = expected && [
        {denomination: 20, count: expected[0]},
        {denomination: 50, count: expected[1]}
      ]
      assert.deepEqual(BillMath.makeChange(cartridges, amount), realExpected)
    }

    it('gives change for 10', function () {
      assertChange(10, null)
    })
    it('gives change for 20', function () {
      assertChange(20, [1, 0])
    })
    it('gives change for 30', function () {
      assertChange(30, null)
    })
    it('gives change for 40', function () {
      assertChange(40, [2, 0])
    })
    it('gives change for 50', function () {
      assertChange(50, [0, 1])
    })
    it('gives change for 110', function () {
      assertChange(110, [3, 1])
    })
    it('gives change for 120', function () {
      assertChange(120, [1, 2])
    })
    it('gives change for 130', function () {
      assertChange(130, [4, 1])
    })
    it('gives change for 140', function () {
      assertChange(140, [2, 2])
    })
    it('gives change for 150', function () {
      assertChange(150, [5, 1])
    })
    it('gives change for 160', function () {
      assertChange(160, [3, 2])
    })
    it('gives change for 300', function () {
      assertChange(300, [10, 2])
    })
  })

  describe('just 20s', function () {
    var cartridges = [
      {denomination: 20, count: 100}, {denomination: 50, count: 0}
    ]

    function assertChange (amount, expected) {
      var realExpected = expected && [
        {denomination: 20, count: expected[0]},
        {denomination: 50, count: expected[1]}
      ]
      assert.deepEqual(BillMath.makeChange(cartridges, amount), realExpected)
    }

    it('gives change for 50', function () {
      assertChange(50, null)
    })

    it('gives change for 20', function () {
      assertChange(20, [1, 0])
    })
  })

  describe('sumChange', function () {
    it('sums some change', function () {
      var arr = [
        [{count: 1, denomination: 20}, {count: 0, denomination: 50}],
        [{count: 2, denomination: 20}, {count: 1, denomination: 50}],
        [{count: 0, denomination: 20}, {count: 10, denomination: 50}]
      ]
      var res = [{count: 3, denomination: 20}, {count: 11, denomination: 50}]
      assert.deepEqual(BillMath.sumChange(arr), res)
    })
    it('sums empty list', function () {
      assert.deepEqual(BillMath.sumChange([]), [{count: 0}, {count: 0}])
    })
  })
})
