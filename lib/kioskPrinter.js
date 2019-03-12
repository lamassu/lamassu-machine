const SerialPort = require('serialport')
const { StringDecoder } = require('string_decoder');

module.exports = {
    checkStatus,
    printWallet
}


// PUBLIC INTERFACE
// ----------------

function checkStatus (printerCfg) {
  return new Promise((resolve, reject) => {
    const model = checkPrinterModel(printerCfg)

    if (model === printerModels.zebra)
      return checkStatusZebra(printerCfg)
        .then((printerStatus) => resolve(printerStatus))
        .catch((err) => reject(err))

    return reject(errorMsgUnsupportedPrinter())
  })
}


function printWallet (wallet, printerCfg) {
  return new Promise((resolve, reject) => {
    const model = checkPrinterModel(printerCfg)

    if (model === printerModels.zebra)
      return printWalletZebra(wallet, printerCfg)
        .then(() => resolve())
        .catch((err) => reject(err))

    return reject(errorMsgUnsupportedPrinter())
  })
}


// PRIVATE INTERFACE
// -----------------

const printerModels = {
    zebra: "Zebra",
    unknown: "Unknown"
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
        printerCfg.address)
      return printerModels.zebra

    return printerModels.unknown
}

function openSerialPort(printerCfg, rs232Settings) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort(printerCfg.address, rs232Settings)
    port.open((err) => {
      if (err)
        return reject(err)
      return resolve(port)
    })
  })
}

function errorMsgUnsupportedPrinter() {
  return new Error('Unsupported printer configuration.')
}

function translateZebraStatusCode (statusCode) {
  const humanReadableStatus = {
    hasErrors: false,
    hasWarnings: false,
    errorList: [],
    warningsList: []
  }

  if (statusCode[0] === '1') {
    humanReadableStatus.hasErrors = true
    if (statusCode[16] === '8')
      humanReadableStatus.errorList.push('Paper cutter fault.')
    if (statusCode[16] === '4')
      humanReadableStatus.errorList.push('Printing head is open.')
    if (statusCode[16] === '2')
      humanReadableStatus.errorList.push('Ribbon is out.')
    if (statusCode[16] === '1')
      humanReadableStatus.errorList.push('Media is out.')

    if (statusCode[15] === '8')
      humanReadableStatus.errorList.push('Printing head detection error.')
    if (statusCode[15] === '4')
      humanReadableStatus.errorList.push('Bad printing head element.')
    if (statusCode[15] === '2')
      humanReadableStatus.errorList.push('Printing motor over temperature.')
    if (statusCode[15] === '1')
      humanReadableStatus.errorList.push('Printing head over temperature.')

    if (statusCode[14] === '2')
      humanReadableStatus.errorList.push('Printing head thermistor open.')
    if (statusCode[14] === '1')
      humanReadableStatus.errorList.push('Invalid firmware configuration.')

    if (statusCode[13] === '8')
      humanReadableStatus.errorList.push('Clear paper path failed.')
    if (statusCode[13] === '4')
      humanReadableStatus.errorList.push('Paper feed error.')
    if (statusCode[13] === '2')
      humanReadableStatus.errorList.push('Paper presenter not running.')
    if (statusCode[13] === '1')
      humanReadableStatus.errorList.push('Paper jam during retract.')

    if (statusCode[12] === '8')
      humanReadableStatus.errorList.push('Black mark not found.')
    if (statusCode[12] === '4')
      humanReadableStatus.errorList.push('Black mark calibration error.')
    if (statusCode[12] === '2')
      humanReadableStatus.errorList.push('Retract function timeout.')
    if (statusCode[12] === '1')
      humanReadableStatus.errorList.push('Printer is paused.')
  }
  if (statusCode[17] === '1') {
    humanReadableStatus.hasWarnings = true
  }

  return humanReadableStatus
}

function checkStatusZebra (printerCfg) {
  return new Promise((resolve, reject) => {
    return openSerialPort(printerCfg, zebraRS232Settings)
      .then((port) => {
        const getStatusCmd = '~HQES'
        const statusCode = []
        const statusCodeLength = 34
        const bufferDecoder = new StringDecoder('ascii')

        port.on('data', (data) => {
          const asciiStatusCode = bufferDecoder.write(data)
          if (statusCode.length === statusCodeLength)
            return

          for (const c of asciiStatusCode) {
            if ('0123456789'.includes(c)) {
              statusCode.push(c)
              if (statusCode.length === statusCodeLength) {
                const humanReadableStatus = translateZebraStatusCode(statusCode)
                port.close()
                resolve(humanReadableStatus)
              }
            }
          }
        })

        port.write(getStatusCmd, 'ascii', (err) => {
          if (err)
            return reject(err)
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
                                   `^AQN,28,24^FD${wallet.privateKey.slice(0, wallet.privateKey.length / 2)}^FS\n` +
                               '^FO50,450' +
                                   `^AQN,28,24^FD${wallet.privateKey.slice(wallet.privateKey.length / 2)}^FS\n` +
                               '^FO80,480' +
                                   `^BQN,2,10,H^FDHM,B0052${wallet.privateKey}^FS\n` +
                               '^FO50,940' +
                                   '^AQN,28,24^FDDon\'t share this QR code with anyone.^FS\n' +

                               '^FO50,1040' +
                                   '^AQN,28,24^FDLoad^FS\n' +
                               '^FO50,1070' +
                                   '^ASN,40,35^FDPUBLIC ADDRESS^FS\n' +
                               '^FO50,1110' +
                                   `^AQN,28,24^FD${wallet.publicAddress}^FS\n` +
                               '^FO80,1170' +
                                   `^BQN,2,10,H^FDHM,B0034${wallet.publicAddress}^FS\n` +

                               '^CN1\n' +
                               '^PN0\n' +
                               '^XZ'

        port.write(printWalletCmd, 'utf8', (err) => {
          if (err)
            return reject(err)

          port.close()
          return resolve()
        })
      })
      .catch((err) => {
          reject(err)
      })
  })
}
