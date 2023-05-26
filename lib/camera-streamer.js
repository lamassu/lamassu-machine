'use strict';

const { execFile } = require('node:child_process')
const path = require('node:path')

const CAMERA_STREAMER = path.resolve(__dirname, '../camera-streamer/camera-streamer')


/* @see `CS_EXIT_*` in `camera-streamer` */
const EXIT_CODES = [
  'OK',
  'WRITE',
  'CAMSTART',
  'CAMSETUP',
  'FMTREAD',
  'FMTWRITE',
  'FMTLIST',
  'CAMOPEN',
  'NOTCAM',
  'BADARGS',
]


const hasCamera = dev =>
  new Promise((resolve, reject) => {
    const ko = spawn_camcheck(dev)
    ko.on('error', reject)

    /* @see set_event_handlers */
    ko.on('close', (code, sig) => resolve(code === 0))
  }).catch(() => false)


const kogoroshiya = ko => () => ko.kill()

const set_event_handlers = (ko, pickFormat) =>
  [
    kogoroshiya(ko),
    new Promise((resolve, reject) => {
      console.log("camera streamer started")
      ko.on('error', reject)
      // TODO: is this useful?
      //ko.on('spawn', on_spawn)

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
        const formats = JSON.parse(line)
        const format = pickFormat(formats)
        if (!format) {
          ko.kill()
          return reject(new Error("no camera format picked"))
        }
        ko.stdin.cork()
        ko.stdin.write(JSON.stringify(format.id))
        ko.stdin.write('\n')
        ko.stdin.uncork()

        state = 'streaming'
        stdata = null
      }

      const streaming = buf => {
        //console.log("triggered streaming")
        accbuf = Buffer.concat([accbuf, buf])
      }

      const handlers = { init, streaming }
      const on_data = buf => handlers[state](buf)

      /* TODO: Get exit code &c */
      const on_close = () => resolve(accbuf)

      ko.stdout.on('data', on_data)

      /*
       * 'close' is emitted only after the process has terminated AND the stdio
       * streams have been closed.
       * @see https://nodejs.org/api/child_process.html#event-close
       */
      ko.on('close', on_close)
    })
  ]


const spawn = args => execFile(CAMERA_STREAMER, args, { encoding: 'buffer' })
const spawn_zxing = (dev, fmt) => spawn([dev, 'zxing', fmt])
const spawn_supyo = (dev, minsize, cutoff) => spawn([dev, 'supyo', minsize, cutoff])
const spawn_camcheck = dev => spawn([dev, 'camcheck'])

const scanQR = (dev, pickFormat) =>
  set_event_handlers(spawn_zxing(dev, 'QRCode'), pickFormat)

const scanPDF417 = (dev, pickFormat) =>
  set_event_handlers(spawn_zxing(dev, 'PDF417'), pickFormat)

const detectFace = (dev, pickFormat, minsize, cutoff) =>
  set_event_handlers(spawn_supyo(dev, minsize, cutoff), pickFormat)

module.exports = {
  hasCamera,
  scanQR,
  scanPDF417,
  detectFace,
}
