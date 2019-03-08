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

function checkStatus (printerCfg) {
  return new Promise((resolve, reject) => {
    if (printerCfg.maker === 'Zebra' &&
        printerCfg.model === 'KR-403' &&
        printerCfg.protocol === 'RS232' &&
        printerCfg.address) {
      return checkStatusZebra(printerCfg)
        .then(() => resolve())
        .catch((err) => reject(err))
    }
    reject({message: 'Unsupported printer configuration'})
  })
}

function checkStatusZebra (printerCfg) {
  return new Promise((resolve, reject) => {
    const port = new SerialPort(printerCfg.address, zebraRS232Settings)
    port.open((err) => {
      if (err)
        return reject(err)

      const getStatusCmd = '~HQES'
      port.write(getStatusCmd, 'ascii', (err) => {
        if (err)
          return reject(err)

        // Giving the printer 1sec to respond to the query about its status
        setTimeout(() => {
          const printerStatusBuffer = port.read()
          port.close()
          return resolve(printerStatusBuffer)
        }, 1000)
      })
    })
  })
}

function printWallet (wallet, printerCfg) {
  return new Promise((resolve, reject) => {
    if (printerCfg.maker === 'Zebra' &&
        printerCfg.model === 'KR-403' &&
        printerCfg.protocol === 'RS232' &&
        printerCfg.address) {
      return printWalletZebra(wallet, printerCfg)
        .then(() => resolve())
        .catch((err) => reject(err))
    }
    reject({message: 'Unsupported printer configuration'})
  })
}

function printWalletZebra (wallet, printerCfg) {

  return new Promise((resolve, reject) => {
    const port = new SerialPort(printerCfg.address, zebraRS232Settings)
    port.open((err) => {
      if (err)
        return reject(err)

      const printWalletCmd = '^XA\n' +
                             '^FO50,250' +
                             '^ASN,40,35^FDBTC PAPER WALLET^FS\n' +
                             '^FO50,350' +
                                 '^AQN,28,24^FDSpend^FS\n' +
                             '^FO50,380' +
                                 '^ASN,40,35^FDPRIVATE KEY^FS\n' +
                             '^FO50,420' +
                                 `^AQN,28,24^FD${wallet.privateAddr.slice(0, wallet.privateAddr.length / 2)}^FS\n` +
                             '^FO50,450' +
                                 `^AQN,28,24^FD${wallet.privateAddr.slice(wallet.privateAddr.length / 2)}^FS\n` +
                             '^FO80,480' +
                                 `^BQN,2,10,H^FDHM,B0052${wallet.privateAddr}^FS\n` +
                             '^FO50,940' +
                                 '^AQN,28,24^FDDon\'t share this QR code with anyone.^FS\n' +

                             '^FO50,1040' +
                                 '^AQN,28,24^FDLoad^FS\n' +
                             '^FO50,1070' +
                                 '^ASN,40,35^FDPUBLIC KEY^FS\n' +
                             '^FO50,1110' +
                                 `^AQN,28,24^FD${wallet.publicAddr}^FS\n` +
                             '^FO80,1170' +
                                 `^BQN,2,10,H^FDHM,B0034${wallet.publicAddr}^FS\n` +

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
  })
}
