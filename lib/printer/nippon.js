const SerialPort = require('serialport')

const lineFeed = [0x0a]
const finalLineFeed = [0x1b, 0x64, 0x05]
const fullCut = [0x1b, 0x69]
const disable = [0x1b, 0x3d, 0x0]
const enable = [0x1b, 0x3d, 0x1]

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

function printReceipt (data, printerCfg) {
  return new Promise((resolve, reject) => {
    return openSerialPort(printerCfg, portOptions)
      .then((port) => {
        const cmd = []

        // disable and enable to get rid of previous buffer
        // useful because of possible comm failure
        cmd.push(disable)
        cmd.push(enable)

        cmd.push('RECEIPT')
        cmd.push(lineFeed)
        cmd.push(lineFeed)
        if (data.operatorInfo) {
          if (data.operatorInfo.name) {
            cmd.push(data.operatorInfo.name)
            cmd.push(lineFeed)
          }

          if (data.operatorInfo.website) {
            cmd.push(data.operatorInfo.website)
            cmd.push(lineFeed)
          }

          if (data.operatorInfo.email) {
            cmd.push(data.operatorInfo.email)
            cmd.push(lineFeed)
          }

          if (data.operatorInfo.phone) {
            cmd.push(data.operatorInfo.phone)
            cmd.push(lineFeed)
          }

          if (data.operatorInfo.companyNumber) {
            cmd.push(data.operatorInfo.companyNumber)
            cmd.push(lineFeed)
          }

          cmd.push(lineFeed)
        }

        if (data.location) {
          const locationText = `Location: ${data.location}`
          locationText.match(/.{1,50}/g).map(it => {
            cmd.push(it)
            cmd.push(lineFeed)
          })
          cmd.push(lineFeed)
        }

        cmd.push(`Customer: ${data.customer}`)
        cmd.push(lineFeed)

        cmd.push('Session:')
        cmd.push(lineFeed)

        cmd.push(`  ${data.session}`)
        cmd.push(lineFeed)

        cmd.push(lineFeed)

        cmd.push(`Time: ${data.time}`)
        cmd.push(lineFeed)

        cmd.push(`Direction: ${data.direction}`)
        cmd.push(lineFeed)

        cmd.push(`Fiat: ${data.fiat}`)
        cmd.push(lineFeed)

        cmd.push(`Crypto: ${data.crypto}`)
        cmd.push(lineFeed)

        cmd.push(`Rate: ${data.rate}`)
        cmd.push(lineFeed)

        cmd.push(lineFeed)

        cmd.push(`TXID: `)
        cmd.push(lineFeed)

        if (data.txId) {
          cmd.push(`  ${data.txId.slice(0, data.txId.length / 2)}`)
          cmd.push(lineFeed)

          cmd.push(`  ${data.txId.slice(data.txId.length / 2)}`)
          cmd.push(lineFeed)
        }

        cmd.push(lineFeed)

        cmd.push('Address:')
        cmd.push(lineFeed)

        cmd.push(`  ${data.address.slice(0, Math.ceil(data.address.length / 2))}`)
        cmd.push(lineFeed)

        cmd.push(`  ${data.address.slice(Math.ceil(data.address.length / 2))}`)
        cmd.push(lineFeed)

        cmd.push(lineFeed)

        // QRcode
        const qrcodeLen = Math.floor(data.address.length / 256)
        const qrcodeLenRemainder = data.address.length % 256
        cmd.push([0x1b, 0x71, 0x06, 0x03, 0x04, 0x05, qrcodeLenRemainder, qrcodeLen])
        cmd.push(data.address)

        cmd.push(finalLineFeed)
        cmd.push(fullCut)

        port.write(Buffer.concat(cmd.map(Buffer.from)), err => {
          if (err) reject(err)

          port.close()
          resolve()
        })
      })
  })
}

function printWallet (wallet, printerCfg) {
  return new Promise((resolve, reject) => {
    return openSerialPort(printerCfg, portOptions)
      .then((port) => {
        const cmd = []

        // disable and enable to get rid of previous buffer
        // useful because of possible comm failure
        cmd.push(disable)
        cmd.push(enable)

        cmd.push('BTC PAPER WALLET')
        cmd.push(lineFeed)
        cmd.push(lineFeed)
        cmd.push('Spend')
        cmd.push(lineFeed)
        cmd.push('PRIVATE KEY')
        cmd.push(lineFeed)
        cmd.push(wallet.privateKey.slice(0, wallet.privateKey.length / 2))
        cmd.push(lineFeed)
        cmd.push(wallet.privateKey.slice(wallet.privateKey.length / 2))
        cmd.push(lineFeed)

        // QR Code
        const qrcodeLen = Math.floor(wallet.privateKey.length / 256)
        const qrcodeLenRemainder = wallet.privateKey.length % 256
        cmd.push([0x1b, 0x71, 0x06, 0x03, 0x04, 0x05, qrcodeLenRemainder, qrcodeLen])
        cmd.push(wallet.privateKey)

        // New lines and cut
        cmd.push(finalLineFeed)
        cmd.push(fullCut)

        port.write(Buffer.concat(cmd.map(Buffer.from)), err => {
          if (err) reject(err)

          port.close()
          resolve()
        })
      })
  })
}

function checkStatus () {
  return Promise.resolve('status unavailable for nippon printers')
}

function openSerialPort (printerCfg, rs232Settings) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort(printerCfg.address, rs232Settings)
    port.open((err) => {
      if (err) return reject(err)

      return resolve(port)
    })
  })
}

module.exports = {
  printReceipt,
  printWallet,
  checkStatus
}
