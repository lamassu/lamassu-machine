const util = require('util')
const v4l2camera = require('v4l2camera')

const cam = new v4l2camera.Camera('/dev/video0')
console.log(util.inspect(cam.formats, {colors: true, depth: null}))
