const fs = require('fs')
const v4l2camera = require('v4l2camera')
const cam = new v4l2camera.Camera(process.argv[2])

const interval = 100
const runs = 2

const format = cam.formats.filter(f => f.formatName === 'MJPG' && f.width === 1280)[0]
cam.configSet(format)

console.log('%j', cam.configGet())

let locked = false
let capturing = false

let series = 0

// setInterval(run, (runs + 5) * interval)
run()

function run () {
  if (locked) return

  series += 1
  console.log('series ' + series)
  let count = 0

  console.log('DEBUG1')
  cam.start()
  locked = true
  console.log('DEBUG2')

  const int1 = setInterval(capture, interval)

  function capture () {
    if (capturing) return
    capturing = true

    count += 1
    if (count > runs) {
      console.log('DEBUG3')
      cam.stop(() => {
        capturing = false
        locked = false
        console.log('stopped')
      })

      console.log('DEBUG4')
      clearInterval(int1)
      console.log('DEBUG4.1')

      return
    }

    console.log('DEBUG5')

    cam.capture(function (success) {
      console.log('DEBUG6')
      const frame = Buffer.from(cam.frameRaw())
      console.log('DEBUG7: %s', frame.slice(0, 10).toString('hex'))

      if (count === 2) fs.writeFileSync('test' + series + '-' + count + '.jpg', frame, {encoding: null})
      capturing = false
      console.log('Wrote: ' + 'test' + series + '-' + count + '.jpg')
    })
  }
}

