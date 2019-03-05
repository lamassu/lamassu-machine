const SerialPort = require('serialport')

module.exports = {
    checkStatus,
    printWallet
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

function checkStatus (printerCfg, callback) {

  if (printerCfg.maker === 'Zebra' &&
      printerCfg.model === 'KR-403' &&
      printerCfg.protocol === 'RS232' &&
      printerCfg.address)
    checkStatusZebra(printerCfg, callback)

  else callback({message: 'Unsupported printer configuration'})
}

function checkStatusZebra (printerCfg, callback) {

  const port = new SerialPort(printerCfg.address, zebraRS232Settings)

  port.open((err) => {
    if (err) {
        callback(null, err)
        return
    }

    const getStatusCmd = '~HQES'
    port.write(getStatusCmd, 'ascii', (err) => {
      if (err) {
        callback(null, err)
        return
      }

      setTimeout(() => {
        const printerStatusBuffer = port.read()
        port.close()
        callback(printerStatusBuffer, null)
      }, 10000)
    })
  })
}

function printWallet (pubAddr, privAddr, printerCfg, callback) {

  if (printerCfg.maker === 'Zebra' &&
      printerCfg.model === 'KR-403' &&
      printerCfg.protocol === 'RS232' &&
      printerCfg.address)
    printWalletZebra(pubAddr, privAddr, printerCfg, callback)

  else callback ({message: 'Unsupported printer configuration'})
}

function printWalletZebra (pubAddr, privAddr, printerCfg, callback) {

  const port = new SerialPort(printerCfg.address, zebraRS232Settings)

  port.open((err) => {
    if (err) {
      callback(err)
      return
    }

    const printWalletCmd = '^XA\n' +
                           '^FO50,250' +
                           '^ASN,40,35^FDBTC PAPER WALLET^FS\n' +
                           '^FO50,350' +
                               '^AQN,28,24^FDSpend^FS\n' +
                           '^FO50,380' +
                               '^ASN,40,35^FDPRIVATE KEY^FS\n' +
                           '^FO50,420' +
                               `^AQN,28,24^FD${privAddr}^FS\n` +
                           '^FO80,480' +
                               `^BQN,2,10,H^FDHM,B0052${privAddr}^FS\n` +
                           '^FO50,940' +
                               '^AQN,28,24^FDDon\'t share this QR code with anyone.^FS\n' +

                           '^FO50,1040' +
                               '^AQN,28,24^FDLoad^FS\n' +
                           '^FO50,1070' +
                               '^ASN,40,35^FDPUBLIC KEY^FS\n' +
                           '^FO50,1110' +
                               `^AQN,28,24^FD${pubAddr}^FS\n` +
                           '^FO80,1170' +
                               `^BQN,2,10,H^FDHM,B0034${pubAddr}^FS\n` +

                           '^CN1\n' +
                           '^PN0\n' +
                           '^XZ'

    port.write(printWalletCmd, 'ascii', (err) => {
      if (err) {
        callback(err)
        return
      }

      port.close()
      callback()
    })
  })
}
