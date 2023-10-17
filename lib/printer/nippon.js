const _ = require('lodash/fp')
const { SerialPort } = require('serialport')

const lineFeed = [0x0a]
const finalLineFeed = [0x1b, 0x64, 0x05]
const fullCut = [0x1b, 0x69]
const disable = [0x1b, 0x3d, 0x0]
const enable = [0x1b, 0x3d, 0x1]
const presenterEjectionTimeout = [0x1B, 0x72, 0x31, 0x10]
const manualEjectionMode = [0x1b, 0x68, 0x02]
const presenterEjection = [0x1b, 0x72, 0x30, 0x01]

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

const openSerialPort = (address, rs232Settings) =>
  new Promise((resolve, reject) => {
    const opts = _.set('path', address, rs232Settings)
    const port = new SerialPort(opts)
    port.open((err) => {
      if (err) return reject(err)

      return resolve(port)
    })
  })

const printReceipt = (data, { address }, receiptConfig) =>
  new Promise((resolve, reject) =>
    openSerialPort(address, portOptions)
      .then((port) => {
        const cmd = []

        // disable and enable to get rid of previous buffer
        // useful because of possible comm failure
        cmd.push(disable)
        cmd.push(enable)

        // set manual ejection mode
        cmd.push(manualEjectionMode)

        cmd.push('RECEIPT')
        cmd.push(lineFeed)
        cmd.push(lineFeed)
        if (data.operatorInfo) {
          if (data.operatorInfo.name) {
            cmd.push(data.operatorInfo.name)
            cmd.push(lineFeed)
          }

          if (data.operatorInfo.website && receiptConfig.operatorWebsite) {
            cmd.push(data.operatorInfo.website)
            cmd.push(lineFeed)
          }

          if (data.operatorInfo.email && receiptConfig.operatorEmail) {
            cmd.push(data.operatorInfo.email)
            cmd.push(lineFeed)
          }

          if (data.operatorInfo.phone && receiptConfig.operatorPhone) {
            cmd.push(`tel. ${data.operatorInfo.phone}`)
            cmd.push(lineFeed)
          }

          if (data.operatorInfo.companyNumber && receiptConfig.companyNumber) {
            cmd.push(data.operatorInfo.companyNumber)
            cmd.push(lineFeed)
          }

          cmd.push(lineFeed)
        }

        if (data.location && receiptConfig.machineLocation) {
          const locationText = `Location: ${data.location}`
          locationText.match(/.{1,50}/g).map(it => {
            cmd.push(it)
            cmd.push(lineFeed)
          })
          cmd.push(lineFeed)
        }

        if (data.customer && receiptConfig.customerNameOrPhoneNumber) {
          cmd.push(`Customer: ${data.customer}`)
          cmd.push(lineFeed)
        }

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

        if (data.rate && receiptConfig.exchangeRate) {
          cmd.push(`Rate: ${data.rate}`)
          cmd.push(lineFeed)
        }

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

        if (data.address && receiptConfig.addressQRCode) {
          const qrcodeLen = Math.floor(data.address.length / 256)
          const qrcodeLenRemainder = data.address.length % 256
          cmd.push([0x1b, 0x71, 0x06, 0x03, 0x04, 0x05, qrcodeLenRemainder, qrcodeLen])
          cmd.push(data.address)
        }

        cmd.push(finalLineFeed)
        cmd.push(fullCut)

        cmd.push(presenterEjection)

        port.write(Buffer.concat(cmd.map(Buffer.from)), err => {
          if (err) reject(err)

          port.close()
          resolve()
        })
      })
  )

const printWallet = (wallet, { address }, code) =>
  new Promise((resolve, reject) =>
    openSerialPort(address, portOptions)
      .then((port) => {
        const cmd = []

        // disable and enable to get rid of previous buffer
        // useful because of possible comm failure
        cmd.push(disable)
        cmd.push(enable)

        // increase rejection timeout
        cmd.push(presenterEjectionTimeout)

        cmd.push(`${code} PAPER WALLET`)
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
  )

const checkStatus = () =>
  Promise.resolve('status unavailable for nippon printers')

module.exports = {
  printReceipt,
  printWallet,
  checkStatus
}
