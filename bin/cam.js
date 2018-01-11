const v4l2camera = require('v4l2camera')

function setConfig (width, height, cam) {
  const format = cam.formats.filter(f => f.formatName === 'MJPG' &&
    f.width === width &&
    f.height === height
  )[0]

  if (!format) throw new Error('Unsupported cam resolution: %dx%d', width, height)
  cam.configSet(format)
}

const cam = new v4l2camera.Camera('/dev/video0')

setConfig(640, 480, cam)

if (cam.configGet().formatName !== 'MJPG') {
  console.log('NOTICE: MJPG camera required')
  process.exit(1)
}

cam.start()
cam.capture(success => {
  const frame = Buffer.from(cam.frameRaw())

  require('fs').createWriteStream('result.jpg').end(Buffer(frame))
  cam.stop()
})
