'use strict';

const { execFile } = require('node:child_process')

const CAMERA_STREAMER = '/path/to/camera-streamer'

const spawn = dev =>
  execFile(CAMERA_STREAMER, [dev], { encoding: 'buffer' })

const set_event_handlers = (pick_format, { stdin, stdout, stderr }) =>
  new Promise((resolve, reject) => {
    const emptyBuf = Buffer.alloc(0)
    let accbuf = emptyBuf;
    let state = 'init';
    let stdata = null

    const init = buf => {
      console.log("triggered init")
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
      console.log("received formats: ", line)
      const formats = JSON.parse(line)
      const format = pick_format(formats)
      // if (!format) {
      //   TODO: Close/Kill camera_streamer if controller doesn't pick any format
      //   return reject(err)
      // }
      stdin.cork()
      stdin.write(JSON.stringify(format.id))
      stdin.write('\n')
      stdin.uncork()

      state = 'streaming'
      stdata = null
    }

    const streaming = buf => {
      console.log("triggered streaming")
      accbuf = Buffer.concat([accbuf, buf])
    }

    const handlers = { init, streaming }
    const on_data = buf => {
      console.log("on_data: ", buf)
      return handlers[state](buf)
    }

    const on_end = () => {
      console.log("triggered end")
      resolve(accbuf)
    }

    console.log("setting up event handlers")
    stdout.on('data', on_data)
    stdout.on('end', on_end)
    stderr.on('data', data => console.log("from stderr: ", data.toString('utf-8')))
    console.log("event handlers set up")
  })

captureFrame = (dev, pick_format) => set_event_handlers(pick_format, spawn(dev))
nullPicker = formats => null // TODO
hasCamera = dev => captureFrame(dev, nullPicker).then(() => true).catch(() => false)

module.exports = {
  captureFrame,
  hasCamera,
}
