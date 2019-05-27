const SerialPort = require('serialport')

const zplHelper = require('./zpl-helper')

const SPACER = 35

module.exports = {
  checkStatus,
  printWallet,
  printReceipt
}

// Public Interface
// ----------------

function checkStatus (printerCfg, statusQueryTimeout) {
  return new Promise((resolve, reject) => {
    const model = checkPrinterModel(printerCfg)

    if (model === printerModels.zebra) {
      return checkStatusZebra(printerCfg, statusQueryTimeout)
        .then((printerStatus) => resolve(printerStatus))
        .catch((err) => reject(err))
    }

    return reject(errorMsgUnsupportedPrinter())
  })
}

function printWallet (wallet, printerCfg) {
  const model = checkPrinterModel(printerCfg)

  if (model === printerModels.zebra) {
    return printWalletZebra(wallet, printerCfg)
  }

  return Promise.reject(errorMsgUnsupportedPrinter())
}

function printReceipt (data, printerCfg) {
  const model = checkPrinterModel(printerCfg)
  if (model === printerModels.zebra) {
    return printReceiptZebra(data, printerCfg)
  }

  return Promise.reject(errorMsgUnsupportedPrinter())
}

// Private Interface
// -----------------

const printerModels = {
  zebra: 'Zebra',
  unknown: 'Unknown'
}

const zebraRS232Settings = {
  autoOpen: false,
  baudRate: 115200,
  parity: 'none',
  dataBits: 8,
  stopBits: 1,
  xon: true,
  xoff: true
}

function checkPrinterModel (printerCfg) {
  if (printerCfg.maker === 'Zebra' &&
      printerCfg.model === 'KR-403' &&
      printerCfg.protocol === 'RS232' &&
      printerCfg.address) {
    return printerModels.zebra
  }

  return printerModels.unknown
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

function errorMsgUnsupportedPrinter () {
  return new Error('Unsupported printer configuration.')
}

function translateZebraStatusCode (statusCode) {
  const errorsList = [
    { index: 0, code: 8, description: 'Cutter Fault' },
    { index: 0, code: 4, description: 'Head Open' },
    { index: 0, code: 2, description: 'Ribbon Out' },
    { index: 0, code: 1, description: 'Media Out' },
    { index: 1, code: 8, description: 'Printhead Detection Error' },
    { index: 1, code: 4, description: 'Bad Printhead Element' },
    { index: 1, code: 2, description: 'Motor Over Temperature' },
    { index: 1, code: 1, description: 'Printhead Over Temperature' },
    { index: 2, code: 2, description: 'Printhead Thermistor Open' },
    { index: 2, code: 1, description: 'Invalid Firmware Configuration' },
    { index: 3, code: 8, description: 'Clear Paper Path Failed' },
    { index: 3, code: 4, description: 'Paper Feed Error' },
    { index: 3, code: 2, description: 'Presenter Not Running' },
    { index: 3, code: 1, description: 'Paper Jam during Retract' },
    { index: 4, code: 8, description: 'Black Mark not Found' },
    { index: 4, code: 4, description: 'Black Mark Calabrate Error' },
    { index: 4, code: 2, description: 'Retract Function timed out' },
    { index: 4, code: 1, description: 'Paused' }
  ]

  const warningsList = [
    { index: 0, code: 8, description: 'Paper Near End' },
    { index: 0, code: 4, description: 'Replace Printhead' },
    { index: 0, code: 2, description: 'Clean Printhead' },
    { index: 0, code: 1, description: 'Need to Calibrate Media' },
    { index: 1, code: 8, description: 'Sensor 4 - Loop Ready' },
    { index: 1, code: 4, description: 'Sensor 3 - Paper After Header' },
    { index: 1, code: 2, description: 'Sensor 2 - Black Mark' },
    { index: 1, code: 1, description: 'Sensor 1 - Paper Before Head' },
    { index: 2, code: 8, description: 'Sensor 8 - At Bin' },
    { index: 2, code: 4, description: 'Sensor 7 - In Retract' },
    { index: 2, code: 2, description: 'Sensor 6 - Retract Ready' },
    { index: 2, code: 1, description: 'Sensor 5 - Presenter' }
  ]

  const humanReadableStatus = {
    hasErrors: false,
    hasWarnings: false,
    errorList: [],
    warningsList: []
  }

  humanReadableStatus.hasErrors = statusCode.hasErrorFlag === '1'
  humanReadableStatus.hasWarnings = statusCode.hasWarningFlag === '1'

  errorsList.forEach(entry => {
    const code = parseInt(statusCode.errorCodes[entry.index])
    if (code & entry.code) humanReadableStatus.errorList.push(entry)
  })
  warningsList.forEach(entry => {
    const code = parseInt(statusCode.warningCodes[entry.index])
    if (code & entry.code) humanReadableStatus.warningsList.push(entry)
  })

  return humanReadableStatus
}

function checkStatusZebra (printerCfg, statusQueryTimeout) {
  return new Promise((resolve, reject) => {
    return openSerialPort(printerCfg, zebraRS232Settings)
      .then((port) => {
        const timeout = setTimeout(() => {
          port.close()
          reject(new Error('Timeout while waiting for printer\'s status query result.'))
        },
        statusQueryTimeout)

        const getStatusCmd = '~HQES'
        let statusBuffer = ''
        const msgRx = new RegExp(/PRINTER STATUS\s*/.source +
                                 /ERRORS:\s*(0|1)\s(\d{8})\s(\d{8})\s*/.source +
                                 /WARNINGS:\s*(0|1)\s(\d{8})\s(\d{8})/.source)
        port.on('data', (data) => {
          statusBuffer += data.toString()
          const match = msgRx.exec(statusBuffer)
          if (match) {
            clearTimeout(timeout)
            port.close()

            const statusCode = {
              hasErrorFlag: match[1],
              errorCodes: match[3].split('').reverse().concat(
                match[2].split('').reverse()
              ),
              hasWarningFlag: match[4],
              warningCodes: match[6].split('').reverse().concat(
                match[5].split('').reverse()
              )
            }
            const humanReadableStatus = translateZebraStatusCode(statusCode)
            resolve(humanReadableStatus)
          }
        })

        port.write(getStatusCmd, 'ascii', (err) => {
          if (err) return reject(err)
        })
      })
      .catch((err) => {
        return reject(err)
      })
  })
}

function printWalletZebra (wallet, printerCfg) {
  return new Promise((resolve, reject) => {
    return openSerialPort(printerCfg, zebraRS232Settings)
      .then((port) => {
        const printWalletCmd = '^XA\n' +
                               '^FO50,250' +
                               '^ASN,40,35^FDBTC PAPER WALLET^FS\n' +
                               '^FO50,350' +
                                   '^AQN,28,24^FDSpend^FS\n' +
                               '^FO50,380' +
                                   '^ASN,40,35^FDPRIVATE KEY^FS\n' +
                               '^FO50,420' +
                                   `^ARN,28,24^FD${wallet.privateKey.slice(0, wallet.privateKey.length / 2)}^FS\n` +
                               '^FO50,450' +
                                   `^ARN,28,24^FD${wallet.privateKey.slice(wallet.privateKey.length / 2)}^FS\n` +
                               '^FO80,480' +
                                   `^BQN,2,10,H^FDHM,B0052${wallet.privateKey}^FS\n` +
                               '^FO50,940' +
                                   '^AQN,28,24^FDDon\'t share this QR code with anyone.^FS\n' +

                               '^CN1\n' +
                               '^PN0\n' +
                               '^XZ'

        port.write(printWalletCmd, 'utf8', (err) => {
          if (err) return reject(err)

          port.close()
          return resolve()
        })
      })
      .catch((err) => {
        reject(err)
      })
  })
}

function printReceiptZebra (data, printerCfg) {
  return new Promise((resolve, reject) => {
    return openSerialPort(printerCfg, zebraRS232Settings)
      .then((port) => {
        let cmd = zplHelper.start()
        let yPosition = 250

        cmd += zplHelper.header('RECEIPT', yPosition)
        yPosition += 80

        if (data.operatorInfo) {
          if (data.operatorInfo.name) {
            cmd += zplHelper.subheader(`${data.operatorInfo.name}`, yPosition)
            yPosition += Math.ceil(SPACER * 1.3)
          }

          if (data.operatorInfo.website) {
            cmd += zplHelper.text(`${data.operatorInfo.website}`, yPosition)
            yPosition += SPACER
          }

          if (data.operatorInfo.email) {
            cmd += zplHelper.text(`${data.operatorInfo.email}`, yPosition)
            yPosition += SPACER
          }

          if (data.operatorInfo.phone) {
            cmd += zplHelper.text(`${data.operatorInfo.phone}`, yPosition)
            yPosition += SPACER
          }

          if (data.operatorInfo.companyNumber) {
            cmd += zplHelper.text(data.operatorInfo.companyNumber, yPosition)
            yPosition += SPACER
          }

          yPosition += SPACER
        }

        if (data.location) {
          const locationText = `Location: ${data.location}`
          locationText.match(/.{1,50}/g).map(it => {
            cmd += zplHelper.text(it, yPosition)
            yPosition += SPACER
          })
          yPosition += SPACER
        }

        cmd += zplHelper.text(`Customer: ${data.customer}`, yPosition)
        yPosition += SPACER

        cmd += zplHelper.text('Session:', yPosition)
        yPosition += SPACER

        cmd += zplHelper.text(`  ${data.session}`, yPosition)
        yPosition += SPACER

        yPosition += SPACER

        cmd += zplHelper.text(`Time: ${data.time}`, yPosition)
        yPosition += SPACER

        cmd += zplHelper.text(`Direction: ${data.direction}`, yPosition)
        yPosition += SPACER

        cmd += zplHelper.text(`Fiat: ${data.fiat}`, yPosition)
        yPosition += SPACER

        cmd += zplHelper.text(`Crypto: ${data.crypto}`, yPosition)
        yPosition += SPACER

        cmd += zplHelper.text(`Rate: ${data.rate}`, yPosition)
        yPosition += SPACER

        yPosition += SPACER

        cmd += zplHelper.text(`TXID: `, yPosition)
        yPosition += SPACER

        if (data.txId) {
          cmd += zplHelper.text(`  ${data.txId.slice(0, data.txId.length / 2)}`, yPosition)
          yPosition += SPACER

          cmd += zplHelper.text(`  ${data.txId.slice(data.txId.length / 2)}`, yPosition)
          yPosition += SPACER
        }

        yPosition += SPACER

        cmd += zplHelper.text('Address:', yPosition)
        yPosition += SPACER

        cmd += zplHelper.text(`  ${data.address.slice(0, Math.ceil(data.address.length / 2))}`, yPosition)
        yPosition += SPACER

        cmd += zplHelper.text(`  ${data.address.slice(Math.ceil(data.address.length / 2))}`, yPosition)
        yPosition += SPACER

        yPosition += SPACER

        cmd += zplHelper.qrCode(data.address, yPosition)

        cmd += zplHelper.end()

        port.write(cmd, 'utf8', (err) => {
          if (err) return reject(err)

          port.close()
          return resolve()
        })
      })
      .catch((err) => {
        reject(err)
      })
  })
}
