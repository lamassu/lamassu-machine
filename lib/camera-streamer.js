'use strict';

const { execFile } = require('node:child_process')

const CAMERA_STREAMER = '/home/ubuntu/Desktop/camera-streamer'

const spawn = dev =>
  execFile(CAMERA_STREAMER, [dev], { encoding: 'buffer' })

const set_event_handlers = (pickFormat, child) =>
  new Promise((resolve, reject) => {
    console.log("camera streamer started")
    child.on('error', reject)
    // TODO: is this useful?
    //child.on('spawn', on_spawn)

    const emptyBuf = Buffer.alloc(0)
    let accbuf = emptyBuf;
    let state = 'init';
    let stdata = null

    const init = buf => {
      //console.log("triggered init")
      // Keep offset of where to start looking for the newline
      if (stdata === null) stdata = 0

      accbuf = Buffer.concat([accbuf, buf])

      const nlos = accbuf.indexOf('\n', stdata)
      if (nlos < 0) { // No newline
        // Next time we start at the end of the current buffer
        stdata = accbuf.length
        return
      }

      if (nlos === accbuf.length-1) { // accbuf has a whole line
        buf = accbuf
        accbuf = emptyBuf
      } else {
        buf = accbuf.subarray(0, nlos+1)
        accbuf = accbuf.subarray(nlos+1)
      }

      const line = buf.toString('utf-8')
      //console.log("received formats: ", line)
      const formats = JSON.parse(line)
      const format = pickFormat(formats)
      if (!format) {
        child.kill()
        return reject(new Error("no camera format picked"))
      }
      child.stdin.cork()
      child.stdin.write(JSON.stringify(format.id))
      child.stdin.write('\n')
      child.stdin.uncork()

      state = 'streaming'
      stdata = null
    }

    const streaming = buf => {
      //console.log("triggered streaming")
      accbuf = Buffer.concat([accbuf, buf])
    }

    const handlers = { init, streaming }
    const on_data = buf => {
      //console.log("on_data: ", buf)
      return handlers[state](buf)
    }

    const on_end = () => {
      //console.log("triggered end")
      resolve(accbuf)
    }

    //console.log("setting up event handlers")
    child.stdout.on('data', on_data)
    child.stdout.on('end', on_end)
    //child.stderr.on('data', data => console.log("from stderr: ", data.toString('utf-8')))
    //console.log("event handlers set up")
  })

const captureFrame = (dev, pickFormat) => set_event_handlers(pickFormat, spawn(dev))

const _hasCamera = dev => {
  let ret = false
  const nullPicker = formats => {
    ret = true
    return null
  }
  return captureFrame(dev, nullPicker).then(() => ret).catch(() => ret)
}

const hasCamera = async (dev) => {
  return await _hasCamera(dev)
}

module.exports = {
  captureFrame,
  hasCamera,
}
