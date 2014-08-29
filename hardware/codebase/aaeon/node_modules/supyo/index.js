'use strict';

var supyo = require('./build/Release/supyo');

exports.detect = function detect(image, width, height, options) {
  options = options || {};
  var minSize = options.minSize || 100;
  var qualityThreshold = options.qualityThreshold || 50;
  return supyo.detect(image, width, height, minSize, qualityThreshold);
};
