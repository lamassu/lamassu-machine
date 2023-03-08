const _ = require('lodash/fp')
const genmega = require('genmega')
const returnValuesTable = require('../common/return-table')

const newLine = ['\r\n']

function checkStatus (printerCfg) {
  return new Promise((resolve, reject) => {
    _openSerialPort(printerCfg)
      .then(() => {
        const { iRet, data } = genmega.RPUStatus()
        if (iRet < 0) reject(new Error(returnValuesTable[iRet.toString()]))
        // TODO: process the multiple status and throw informative errors if needed
        const result = {
          hasErrors: _.includes('1', [data.result.LineStatus, data.result.PaperLoad, data.result.PaperTphLoad, data.result.TphLever, data.result.PaperJam, data.result.CutterHome]),
          hasWarnings: _.includes('1', [data.result.PaperNearEnd, data.result.PaperNormal])
        }
        return resolve(result)
      })
  })
}

function printReceipt (data, printerCfg, receiptConfig) {
  return new Promise((resolve, reject) => {
    _openSerialPort(printerCfg)
      .then(() => {
        const textInput = []

        textInput.push('RECEIPT')
        textInput.push(newLine)
        textInput.push(newLine)
        if (data.operatorInfo) {
          if (data.operatorInfo.name) {
            textInput.push(data.operatorInfo.name)
            textInput.push(newLine)
          }

          if (data.operatorInfo.website && receiptConfig.operatorWebsite) {
            textInput.push(data.operatorInfo.website)
            textInput.push(newLine)
          }

          if (data.operatorInfo.email && receiptConfig.operatorEmail) {
            textInput.push(data.operatorInfo.email)
            textInput.push(newLine)
          }

          if (data.operatorInfo.phone && receiptConfig.operatorPhone) {
            textInput.push(`tel. ${data.operatorInfo.phone}`)
            textInput.push(newLine)
          }

          if (data.operatorInfo.companyNumber && receiptConfig.companyNumber) {
            textInput.push(data.operatorInfo.companyNumber)
            textInput.push(newLine)
          }

          textInput.push(newLine)
        }

        if (data.location && receiptConfig.machineLocation) {
          const locationText = `Location: ${data.location}`
          locationText.match(/.{1,50}/g).map(it => {
            textInput.push(it)
            textInput.push(newLine)
          })
          textInput.push(newLine)
        }

        if (data.customer && receiptConfig.customerNameOrPhoneNumber) {
          textInput.push(`Customer: ${data.customer}`)
          textInput.push(newLine)
        }

        textInput.push('Session:')
        textInput.push(newLine)

        textInput.push(`  ${data.session}`)
        textInput.push(newLine)

        textInput.push(newLine)

        textInput.push(`Time: ${data.time}`)
        textInput.push(newLine)

        textInput.push(`Direction: ${data.direction}`)
        textInput.push(newLine)

        textInput.push(`Fiat: ${data.fiat}`)
        textInput.push(newLine)

        textInput.push(`Crypto: ${data.crypto}`)
        textInput.push(newLine)

        if (data.rate && receiptConfig.exchangeRate) {
          textInput.push(`Rate: ${data.rate}`)
          textInput.push(newLine)
        }

        textInput.push(newLine)

        textInput.push(`TXID: `)
        textInput.push(newLine)

        if (data.txId) {
          textInput.push(`  ${data.txId.slice(0, data.txId.length / 2)}`)
          textInput.push(newLine)

          textInput.push(`  ${data.txId.slice(data.txId.length / 2)}`)
          textInput.push(newLine)
        }

        textInput.push(newLine)

        textInput.push('Address:')
        textInput.push(newLine)

        textInput.push(`  ${data.address.slice(0, Math.ceil(data.address.length / 2))}`)
        textInput.push(newLine)

        textInput.push(`  ${data.address.slice(Math.ceil(data.address.length / 2))}`)
        textInput.push(newLine)

        textInput.push(newLine)

        // QRcode

        if (data.address && receiptConfig.addressQRCode) {
          const qrcodeLen = Math.floor(data.address.length / 256)
          const qrcodeLenRemainder = data.address.length % 256
          textInput.push(`[0x1b, 0x71, 0x06, 0x03, 0x04, 0x05, ${qrcodeLenRemainder}, ${qrcodeLen}]` + data.address)
        }

        textInput.push(newLine)

        const { iRet: iRetPrintText } = genmega.RPUPrintText(textInput.join(''))
        if (iRetPrintText < 0) reject(new Error(returnValuesTable[iRetPrintText.toString()]))
        const { iRet: iRetCutPaper } = genmega.RPUCutPaper()
        if (iRetCutPaper < 0) reject(new Error(returnValuesTable[iRetCutPaper.toString()]))
        _closeSerialPort()
        resolve()
      })
  })
}

function printWallet (wallet, printerCfg, code) {
  return new Promise((resolve, reject) => {
    return _openSerialPort(printerCfg)
      .then(() => {
        const textInput = []

        textInput.push(`${code} PAPER WALLET`)
        textInput.push(newLine)
        textInput.push(newLine)
        textInput.push('Spend')
        textInput.push(newLine)
        textInput.push('PRIVATE KEY')
        textInput.push(newLine)
        textInput.push(wallet.privateKey.slice(0, wallet.privateKey.length / 2))
        textInput.push(newLine)
        textInput.push(wallet.privateKey.slice(wallet.privateKey.length / 2))
        textInput.push(newLine)

        // QR Code
        const qrcodeLen = Math.floor(wallet.privateKey.length / 256)
        const qrcodeLenRemainder = wallet.privateKey.length % 256
        const qrCode = `[0x1b, 0x71, 0x06, 0x03, 0x04, 0x05, ${qrcodeLenRemainder}, ${qrcodeLen}]` + wallet.privateKey
        textInput.push(qrCode)
        textInput.push(newLine)

        const { iRet: iRetPrintText } = genmega.RPUPrintText(textInput.join(''))
        if (iRetPrintText < 0) reject(new Error(returnValuesTable[iRetPrintText.toString()]))
        const { iRet: iRetCutPaper } = genmega.RPUCutPaper()
        if (iRetCutPaper < 0) reject(new Error(returnValuesTable[iRetCutPaper.toString()]))
        _closeSerialPort()
        resolve()
      })
  })
}

function printCashboxReceipt (data, printerCfg) {
  return new Promise((resolve, reject) => {
    return _openSerialPort(printerCfg)
      .then(() => {
        const textInput = []

        textInput.push('CASH COLLECTION RECEIPT')
        textInput.push(newLine)
        textInput.push(newLine)

        if (data.batch) {
          if (data.batch.created) {
            textInput.push(`Date and time`)
            textInput.push(`---------------------`)
            textInput.push(data.batch.created)
            textInput.push(newLine)
            textInput.push(newLine)
          }
          if (data.batch.id && data.batch.operationType) {
            textInput.push(`Batch creation mode: automatic`)
            textInput.push(`Batch ID: ${data.batch.id}`)
            textInput.push(newLine)
          } else {
            textInput.push(`Batch creation mode: manual`)
            textInput.push(newLine)
            textInput.push(newLine)
          }
          if (data.batch.deviceId) {
            textInput.push(`Machine ID: ${data.batch.deviceId}`)
            textInput.push(newLine)
          }
          if (data.batch.machineName) {
            textInput.push(`Machine name: ${data.batch.machineName}`)
            textInput.push(newLine)
          }
          if (data.batch.billCount) {
            textInput.push(newLine)
            textInput.push(`Bill count: ${data.batch.billCount}`)
            textInput.push(newLine)
          }
          if (data.batch.fiatTotals) {
            textInput.push(newLine)
            textInput.push(`Total amount per fiat`)
            textInput.push(`---------------------`)
            textInput.push(_.join(' | ', _.map(it => `${it}: ${data.batch.fiatTotals[it]}`, _.keys(data.batch.fiatTotals))))
            textInput.push(newLine)
          }
          if (data.batch.billsByDenomination) {
            textInput.push(newLine)
            textInput.push(`Bills by denomination`)
            textInput.push(`---------------------`)
            _.forEach(
              it => {
                textInput.push(`${it}: ${data.batch.billsByDenomination[it]}`)
                textInput.push(newLine)
              },
              _.keys(data.batch.billsByDenomination)
            )
            textInput.push(newLine)
          }
        }

        textInput.push(newLine)

        const { iRet: iRetPrintText } = genmega.RPUPrintText(textInput.join(''))
        if (iRetPrintText < 0) reject(new Error(returnValuesTable[iRetPrintText.toString()]))
        const { iRet: iRetCutPaper } = genmega.RPUCutPaper()
        if (iRetCutPaper < 0) reject(new Error(returnValuesTable[iRetCutPaper.toString()]))
        _closeSerialPort()
        resolve()
      })
  })
}

function _openSerialPort (printerCfg) {
  // TODO: add support for usb devices?
  return new Promise((resolve, reject) => {
    const { iRet } = genmega.RPUStatus(printerCfg.address)
    if (iRet < 0) reject(new Error(returnValuesTable[iRet.toString()]))
    return resolve(printerCfg.address)
  })
}

function _closeSerialPort () {
  genmega.RPUClose()
}

module.exports = {
  printReceipt,
  printWallet,
  printCashboxReceipt,
  checkStatus
}
