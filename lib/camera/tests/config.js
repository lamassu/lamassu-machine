'use strict'

var camera = require('../')
var test = require('tape')
var result

test('config overrides', function (t) {
  t.plan(3)

  result = camera.config()
  t.true(result.debug)

  result = camera.config({
    debug: false
  })
  t.false(result.debug)

  camera.openCamera({
    debug: true
  })
  result = camera.config()
  t.true(result.debug)

  camera.closeCamera()
})

test('config overrides', function (t) {
  t.plan(3)

  result = camera.config()
  t.equal(result.codec, '.jpg')

  result = camera.config({
    codec: '.gif'
  })
  t.equal(result.codec, '.gif')

  camera.openCamera({
    codec: '.jpeg'
  })
  result = camera.config()
  t.equal(result.codec, '.jpeg')

  camera.closeCamera()
})
