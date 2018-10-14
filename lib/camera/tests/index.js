'use strict'

var camera = require('../')
var test = require('tape')
var fs = require('fs')

test('closeCamera', function (t) {
  t.plan(1)

  // closeCamera should be false
  // as the camera wasn't opened
  var result = camera.closeCamera()
  t.false(result)
})

test('getFrameSize', function (t) {
  t.plan(1)

  // getFrameSize should be {}}
  // as the camera wasn't opened
  var result = camera.getFrameSize()
  t.isEquivalent(result, {})
})

test('getFrame', function (t) {
  t.plan(1)

  // getFrame should be an empty Buffer
  // as the camera wasn't opened
  var result = camera.getFrame()
  t.isEqual(result.length, 0)
})

test('openCamera & closeCamera', function (t) {
  t.plan(2)

  // openCamera should be true
  // as the camera was opened
  var result = camera.openCamera({
    codec: '.jpg'
  })
  t.true(result)

  setTimeout(function () {
    console.log('frame size', camera.getFrameSize())

    // closeCamera should be true
    // as the camera was closed
    result = camera.closeCamera()
    t.true(result)
  }, 1000)
})

test('singleShot', function (t) {
  t.plan(2)

  // openCamera should be true
  // as the camera was opened
  var result = camera.openCamera({
    singleShot: true
  })
  t.true(result)

  // after the first frame
  // has been acquired,
  // the camera should be automatically closed
  setTimeout(function () {
    console.log('frame size', camera.getFrameSize())
    t.false(camera.isOpened())
  }, 1000)
})

test('onFrame callback', function (t) {
  // openCamera should be true
  // as the camera was opened
  var result = camera.openCamera({
    codec: '.jpg',

    // on the first frame
    // close the camera
    onFrame: function (frame) {
      console.log('frame size', camera.getFrameSize())
      t.true(camera.isOpened())

      setTimeout(function () {
        t.false(camera.isOpened())
        t.end()
      }, 1000)

      // signal to close
      return false
    }
  })

  t.true(result)
})

test('onFaceDetected callback', function (t) {
  // openCamera should be true
  // as the camera was opened
  var result = camera.openCamera({
    codec: '.jpg',
    threshold: 2,

    // enable face detector
    faceDetect: true,

    // when a face is detected
    // close the camera
    onFaceDetected: function (frame) {
      console.log('face detected')
      console.log('frame size', camera.getFrameSize())
      t.true(camera.isOpened())

      setTimeout(function () {
        t.false(camera.isOpened())
        t.end()
      }, 1000)

      // signal to close
      return false
    }
  })

  t.true(result)
})

test('save frame to file', function (t) {
  // openCamera should be true
  // as the camera was opened
  var result = camera.openCamera({
    singleShot: true,
    codec: '.jpg'
  })
  t.true(result)

  setTimeout(function () {
    var frame = camera.getFrame()
    console.log('frame size', camera.getFrameSize())
    fs.writeFileSync('result.jpg', frame)

    t.end()
  }, 1000)
})
