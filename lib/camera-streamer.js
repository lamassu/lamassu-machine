'use strict';

const { execFile } = require('node:child_process')
const { realpathSync } = require('node:fs')
const path = require('node:path')
const readline = require('node:readline')

const LOG_STDERR = !require('minimist')(process.argv.slice(2)).disableCameraStreamerLogs
const CAMERA_STREAMER = realpathSync(path.resolve(__dirname, '../camera-streamer/camera-streamer'))


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
const exitCode2str = code => EXIT_CODES[code] || (code === 100 ? 'UNEXPECTED' : code)


const hasCamera = dev =>
  new Promise((resolve, reject) => {
    const { ko } = spawn_camcheck(dev)
    ko.on('error', reject)

    /* @see set_event_handlers */
    ko.on('close', (code, sig) => resolve(exitCode2str(code) === 'OK'))
  }).catch(() => false)


const set_event_handlers = ({ ac, ko }, pickFormat) =>
  [
    ac,
    new Promise((resolve, reject) => {
      let aborted = null

      console.log("camera streamer started")
      ko.on('error', reject)
      // TODO: is this useful?
      //ko.on('spawn', on_spawn)

      const emptyBuf = Buffer.alloc(0)
      let accbuf = emptyBuf;
      let state = 'init';
      let stdata = null

      const init = buf => {
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
          aborted = new Error("no camera format picked")
          ac.abort(aborted)
          return
        }
        ko.stdin.cork()
        ko.stdin.end(JSON.stringify(format.id) + '\n', 'utf8', () => {})

        state = 'streaming'
        stdata = null
      }

      const streaming = buf => {
        accbuf = Buffer.concat([accbuf, buf])
      }

      const handlers = { init, streaming }
      const on_data = buf => handlers[state](buf)

      const on_close = (code, sig) => {
        const exitCode = exitCode2str(code)
        /*
         * `aborted` means there was an unexpected error (such as when there
         * are no suitable formats supported by the camera); while `cancelled`
         * means the scan process was cancelled either due to user action (e.g.
         * hitting the X button), or because of a timeout.
         * @see https://nodejs.org/docs/latest-v18.x/api/child_process.html#subprocesskilled
         */
        const cancelled = ko.killed && !aborted
        return exitCode === 'OK' ? resolve(accbuf) : reject({ aborted, cancelled, exitCode, sig })
      }

      if (LOG_STDERR)
        readline
          .createInterface({ input: ko.stderr, terminal: false, historySize: 0, signal: ac.signal })
          .on('line', line => console.log("camera-streamer:", line))

      ko.stdout.on('data', on_data)

      /*
       * 'close' is emitted only after the process has terminated AND the stdio
       * streams have been closed.
       * @see https://nodejs.org/api/child_process.html#event-close
       */
      ko.on('close', on_close)
    })
  ]


const spawn = args => {
  const ac = new AbortController()
  const { signal } = ac
  const ko = execFile(CAMERA_STREAMER, args, { encoding: 'buffer', signal })
  return { ac, ko }
}
const spawn_zxing = (dev, fps, fmt, tmpdir) =>
  spawn(tmpdir ? [dev, 'zxing', fps, fmt, tmpdir] : [dev, 'zxing', fps, fmt])
const spawn_supyo = (dev, fps, minsize, cutoff) => spawn([dev, 'supyo', fps, minsize, cutoff])
const spawn_delayedshot = (dev, fps, delay) => spawn([dev, 'delayedshot', fps, delay])
const spawn_camcheck = dev => spawn([dev, 'camcheck'])

const scanQR = (dev, pickFormat, fps, tmpdir) =>
  set_event_handlers(spawn_zxing(dev, fps, 'QRCode', tmpdir), pickFormat)

const scanPDF417 = (dev, pickFormat, fps, tmpdir) =>
  set_event_handlers(spawn_zxing(dev, fps, 'PDF417', tmpdir), pickFormat)

const delayedshot = (dev, pickFormat, fps, delay) =>
  set_event_handlers(spawn_delayedshot(dev, fps, delay), pickFormat)

const detectFace = (dev, pickFormat, fps, minsize, cutoff) =>
  set_event_handlers(spawn_supyo(dev, fps, minsize, cutoff), pickFormat)

module.exports = {
  hasCamera,
  scanQR,
  scanPDF417,
  detectFace,
  delayedshot,
}
