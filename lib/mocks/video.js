'use strict'

var gmToGrayscale = require('gm-to-grayscale')

var VideoMock = module.exports = function (video, images) {
  if (!(this instanceof VideoMock)) return new VideoMock(video, images)

  this.images = Array.isArray(images) ? images : [images]
  this.currentImage = 0

  this.format = video.format
}

VideoMock.prototype.capture = function (callback) {
  var image = this.images[this.currentImage++]

  // Reset `currentImage` counter so that images loop.
  if (this.currentImage === this.images.length) {
    this.currentImage = 0
  }

  gmToGrayscale(image, function (err, result) {
    callback(err, result.image, result.width, result.height)
  })
}
