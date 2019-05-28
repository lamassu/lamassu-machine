const minimist = require('minimist')
const SerialPort = require('serialport')

const portOptions = {
  autoOpen: false,
  baudRate: 115200,
  parity: 'odd',
  dataBits: 8,
  stopBits: 1,
  rtscts: false,
  xon: true,
  xoff: true
}

const args = minimist(process.argv.slice(2))
const device = args.dev || '/dev/ttyJ5'
const qrcodeStr = args.str || 'https://lamassu.is'
const port = new SerialPort(device, portOptions)


port.on('error', (err) => {
  console.log(`[ERROR]: An error occurred for ${device}: ${err.message}`)
})

port.on('close', (err) => {
  console.log(`[INFO]: Closed connection to ${device}`)
})

port.open((err) => {
  if (err) {
    console.log(`[ERROR]: Could not open ${device}. ` +
                `Additional information: "${err.message}"`)
    return
  }
  else console.log(`[INFO]: Successfully opened a connection to ${device}.`)

  port.write('Thank you for using Lamassu\'s', 'utf-8')
  port.write(Buffer.from([0x0a])) /* Line Feed */
  port.write('Cryptomats! <3', 'utf-8')
  port.write(Buffer.from([0x0a]))
  port.write(`Visit us at ${qrcodeStr} or`, 'utf-8')
  port.write(Buffer.from([0x0a]))
  port.write('use the QR code.', 'utf-8')

  const qrcodeLen = Math.floor(qrcodeStr.length / 256)
  const qrcodeLenRemainder = qrcodeStr.length % 256
  port.write(Buffer.from([0x1b, 0x71, 0x06, 0x03, 0x04, 0x05, qrcodeLenRemainder, qrcodeLen]))
  port.write(qrcodeStr, 'utf-8')

  port.write(Buffer.from([0x0a])) /* Line Feed */
  port.write(Buffer.from([0x1b, 0x69])) /* Full Cut */
})
