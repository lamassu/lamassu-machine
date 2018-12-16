const SerialPort = require('serialport')

const portOptions = {
  autoOpen: false,
  baudRate: 115200,
  parity: 'none',
  dataBits: 8,
  stopBits: 1,
  xon: true,
  xoff: true
}

const device = process.argv[2] || '/dev/ttyUSB1'
const port = new SerialPort(device, portOptions)

port.on('data', (data) => {
  console.log(`[INFO]: Received the following from ${device}: ${data}`)
})

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

  const cmd = '^XA\n' +
              '^FO50,50' +
              '^AQN,28,24' +
                  '^FDThank you for using Lamassu\'s Cryptomats!^FS\n' +
              '^FO50,75' +
              '^AQN,28,24' +
                  '^FDVisit us at https://lamassu.is or use the QR code.^FS\n' +
              '^FO50,100' +
                '^BQN,2,10,H^FDHM,A' +
                'https://lamassu.is^FS\n' +
              '^CN1\n' +
              '^XZ'

  console.log('[INFO]: Printing test message...')

  port.write(cmd, 'ascii', (err) => {
    console.log('[INFO]: Finished printing test message! ')
    port.close()
  })
})
