const _ = require('lodash/fp')
const genmega = require('genmega')
const returnValuesTable = require('../genmega/common/return-table')

const newLine = [0x0a]

function checkStatus (printerCfg) {
  return _openSerialPort(printerCfg)
    .then(() => {
      const { iRet, result } = genmega.RPUStatus()
      if (iRet < 0) return Promise.reject(new Error(returnValuesTable[iRet.toString()]))
      // TODO: process the multiple status and throw informative errors if needed
      return Promise.resolve({
        hasErrors: _.includes('1', [result.LineStatus, result.PaperLoad, result.PaperTphLoad, result.TphLever, result.PaperJam, result.CutterHome]),
        hasWarnings: _.includes('1', [result.PaperNearEnd, result.PaperNormal])
      })
    })
    .finally(_closeSerialPort)
}

function printReceipt (data, printerCfg, receiptConfig) {
  return _openSerialPort(printerCfg)
    .then(() => {
      const cmd = []

      cmd.push('RECEIPT')
      cmd.push(newLine)
      cmd.push(newLine)
      if (data.operatorInfo) {
        if (data.operatorInfo.name) {
          cmd.push(data.operatorInfo.name)
          cmd.push(newLine)
        }

        if (data.operatorInfo.website && receiptConfig.operatorWebsite) {
          cmd.push(data.operatorInfo.website)
          cmd.push(newLine)
        }

        if (data.operatorInfo.email && receiptConfig.operatorEmail) {
          cmd.push(data.operatorInfo.email)
          cmd.push(newLine)
        }

        if (data.operatorInfo.phone && receiptConfig.operatorPhone) {
          cmd.push(`tel. ${data.operatorInfo.phone}`)
          cmd.push(newLine)
        }

        if (data.operatorInfo.companyNumber && receiptConfig.companyNumber) {
          cmd.push(data.operatorInfo.companyNumber)
          cmd.push(newLine)
        }

        cmd.push(newLine)
      }

      if (data.location && receiptConfig.machineLocation) {
        const locationText = `Location: ${data.location}`
        locationText.match(/.{1,50}/g).map(it => {
          cmd.push(it)
          cmd.push(newLine)
        })
        cmd.push(newLine)
      }

      if (data.customer && receiptConfig.customerNameOrPhoneNumber) {
        cmd.push(`Customer: ${data.customer}`)
        cmd.push(newLine)
      }

      cmd.push('Session:')
      cmd.push(newLine)

      cmd.push(`  ${data.session}`)
      cmd.push(newLine)

      cmd.push(newLine)

      cmd.push(`Time: ${data.time}`)
      cmd.push(newLine)

      cmd.push(`Direction: ${data.direction}`)
      cmd.push(newLine)

      cmd.push(`Fiat: ${data.fiat}`)
      cmd.push(newLine)

      cmd.push(`Crypto: ${data.crypto}`)
      cmd.push(newLine)

      if (data.rate && receiptConfig.exchangeRate) {
        cmd.push(`Rate: ${data.rate}`)
        cmd.push(newLine)
      }

      cmd.push(newLine)

      cmd.push(`TXID: `)
      cmd.push(newLine)

      if (data.txId) {
        cmd.push(`  ${data.txId.slice(0, data.txId.length / 2)}`)
        cmd.push(newLine)

        cmd.push(`  ${data.txId.slice(data.txId.length / 2)}`)
        cmd.push(newLine)
      }

      cmd.push(newLine)

      cmd.push('Address:')
      cmd.push(newLine)

      cmd.push(`  ${data.address.slice(0, Math.ceil(data.address.length / 2))}`)
      cmd.push(newLine)

      cmd.push(`  ${data.address.slice(Math.ceil(data.address.length / 2))}`)
      cmd.push(newLine)

      cmd.push(newLine)

      // QRcode

      if (data.address && receiptConfig.addressQRCode) {
        const qrcodeLen = Math.floor(data.address.length / 256) + 0x20
        const qrcodeLenRemainder = (data.address.length % 256) + 0x20
        const size = 0x31 + 4 // 0x31~0x38
        const start = 0x20 + 0 // 0x20~0x5C
        cmd.push([0x1b, 0x71, size, start, qrcodeLenRemainder, qrcodeLen])
        cmd.push(data.address)
      }

      cmd.push(newLine)

      const { iRet: iRetPrintText } = genmega.RPUPrintText(Buffer.concat(cmd.map(Buffer.from)))
      if (iRetPrintText < 0) return Promise.reject(new Error(returnValuesTable[iRetPrintText.toString()]))
      const { iRet: iRetCutPaper } = genmega.RPUCutPaper()
      if (iRetCutPaper < 0) return Promise.reject(new Error(returnValuesTable[iRetCutPaper.toString()]))
      return Promise.resolve()
    })
    .finally(_closeSerialPort)
}

function printWallet (wallet, printerCfg, code) {
  return _openSerialPort(printerCfg)
    .then(() => {
      const cmd = []

      cmd.push(`${code} PAPER WALLET`)
      cmd.push(newLine)
      cmd.push(newLine)
      cmd.push('Spend')
      cmd.push(newLine)
      cmd.push('PRIVATE KEY')
      cmd.push(newLine)
      cmd.push(wallet.privateKey.slice(0, wallet.privateKey.length / 2))
      cmd.push(newLine)
      cmd.push(wallet.privateKey.slice(wallet.privateKey.length / 2))
      cmd.push(newLine)

      // QR Code

      const qrcodeLen = Math.floor(wallet.privateKey.length / 256) + 0x20
      const qrcodeLenRemainder = (wallet.privateKey.length % 256) + 0x20
      cmd.push([0x1b, 0x71, 0x35, 0x20, qrcodeLenRemainder, qrcodeLen])
      cmd.push(wallet.privateKey)

      cmd.push(newLine)

      const { iRet: iRetPrintText } = genmega.RPUPrintText(Buffer.concat(cmd.map(Buffer.from)))
      if (iRetPrintText < 0) return Promise.reject(new Error(returnValuesTable[iRetPrintText.toString()]))
      const { iRet: iRetCutPaper } = genmega.RPUCutPaper()
      if (iRetCutPaper < 0) return Promise.reject(new Error(returnValuesTable[iRetCutPaper.toString()]))
      return Promise.resolve()
    })
    .finally(_closeSerialPort)
}

function printCashboxReceipt (data, printerCfg) {
  return _openSerialPort(printerCfg)
    .then(() => {
      const cmd = []

      cmd.push('CASH COLLECTION RECEIPT')
      cmd.push(newLine)
      cmd.push(newLine)

      if (data.batch) {
        if (data.batch.created) {
          cmd.push(`Date and time`)
          cmd.push(`---------------------`)
          cmd.push(data.batch.created)
          cmd.push(newLine)
          cmd.push(newLine)
        }
        if (data.batch.id && data.batch.operationType) {
          cmd.push(`Batch creation mode: automatic`)
          cmd.push(`Batch ID: ${data.batch.id}`)
          cmd.push(newLine)
        } else {
          cmd.push(`Batch creation mode: manual`)
          cmd.push(newLine)
          cmd.push(newLine)
        }
        if (data.batch.deviceId) {
          cmd.push(`Machine ID: ${data.batch.deviceId}`)
          cmd.push(newLine)
        }
        if (data.batch.machineName) {
          cmd.push(`Machine name: ${data.batch.machineName}`)
          cmd.push(newLine)
        }
        if (data.batch.billCount) {
          cmd.push(newLine)
          cmd.push(`Bill count: ${data.batch.billCount}`)
          cmd.push(newLine)
        }
        if (data.batch.fiatTotals) {
          cmd.push(newLine)
          cmd.push(`Total amount per fiat`)
          cmd.push(`---------------------`)
          cmd.push(_.join(' | ', _.map(it => `${it}: ${data.batch.fiatTotals[it]}`, _.keys(data.batch.fiatTotals))))
          cmd.push(newLine)
        }
        if (data.batch.billsByDenomination) {
          cmd.push(newLine)
          cmd.push(`Bills by denomination`)
          cmd.push(`---------------------`)
          _.forEach(
            it => {
              cmd.push(`${it}: ${data.batch.billsByDenomination[it]}`)
              cmd.push(newLine)
            },
            _.keys(data.batch.billsByDenomination)
          )
          cmd.push(newLine)
        }
      }

      cmd.push(newLine)

      const { iRet: iRetPrintText } = genmega.RPUPrintText(Buffer.concat(cmd.map(Buffer.from)))
      if (iRetPrintText < 0) return Promise.reject(new Error(returnValuesTable[iRetPrintText.toString()]))
      const { iRet: iRetCutPaper } = genmega.RPUCutPaper()
      if (iRetCutPaper < 0) return Promise.reject(new Error(returnValuesTable[iRetCutPaper.toString()]))
      return Promise.resolve()
    })
    .finally(_closeSerialPort)
}

function _openSerialPort (printerCfg) {
  // TODO: add support for usb devices?
  return new Promise((resolve, reject) => {
    const { iRet } = genmega.RPUOpen(printerCfg.address)
    if (iRet < 0) return reject(new Error(returnValuesTable[iRet.toString()]))
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

