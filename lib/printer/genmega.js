const { rpu } = require('genmega')

const ASCII = {
  ESC: 0x1b,
  LF: 0x0a
  q: 0x71,
}

const printQRCode = (cmd, str) => {
  const size = 0x35 // 0x31~0x38
  const start = 0x20 // 0x20~0x5C
  const qrcodeLenRemainder = (str.length % 256) + 0x20
  const qrcodeLen = Math.floor(str.length / 256) + 0x20
  cmd.push(
    [ASCII.ESC, ASCII.q, size, start, qrcodeLenRemainder, qrcodeLen],
    str, [ASCII.LF],
  )
}

const runWithOpenPort = (printerCfg, func) =>
  // TODO: add support for usb devices?
  new Promise((resolve, reject) => {
    const { return_int, return_message } = rpu.open(printerCfg.address)
    if (return_int < 0) return reject(new Error(return_message))
    return resolve(printerCfg.address)
  })
  .then(() => func())
  .finally(() => rpu.close())

function checkStatus (printerCfg) {
  return runWithOpenPort(printerCfg, () => {
    const { return_int, return_message, result } = rpu.status()
    if (return_int < 0) return Promise.reject(new Error(return_message))
    // TODO: process the multiple status and throw informative errors if needed
    return Promise.resolve({
      hasErrors: [result.LineStatus, result.PaperLoad, result.PaperTphLoad, result.TphLever, result.PaperJam, result.CutterHome].includes('1'),
      hasWarnings: [result.PaperNearEnd, result.PaperNormal].includes('1')
    })
  })
}

function printReceipt (data, printerCfg, receiptConfig) {
  return runWithOpenPort(printerCfg, () => {
    const cmd = []

    cmd.push('RECEIPT', [ASCII.LF, ASCII.LF])
    if (data.operatorInfo) {
      if (data.operatorInfo.name)
        cmd.push(data.operatorInfo.name, [ASCII.LF])

      if (data.operatorInfo.website && receiptConfig.operatorWebsite)
        cmd.push(data.operatorInfo.website, [ASCII.LF])

      if (data.operatorInfo.email && receiptConfig.operatorEmail)
        cmd.push(data.operatorInfo.email, [ASCII.LF])

      if (data.operatorInfo.phone && receiptConfig.operatorPhone)
        cmd.push('tel. ', data.operatorInfo.phone, [ASCII.LF])

      if (data.operatorInfo.companyNumber && receiptConfig.companyNumber)
        cmd.push(data.operatorInfo.companyNumber, [ASCII.LF])

      cmd.push([ASCII.LF])
    }

    if (data.location && receiptConfig.machineLocation) {
      const locationText = `Location: ${data.location}`
      locationText.match(/.{1,50}/g).map(it => {
        cmd.push(it, [ASCII.LF])
      })
      cmd.push([ASCII.LF])
    }

    if (data.customer && receiptConfig.customerNameOrPhoneNumber)
      cmd.push('Customer: ', data.customer, [ASCII.LF])

    cmd.push(
      'Session:', [ASCII.LF],
      '  ', data.session, [ASCII.LF],
    )

    cmd.push([ASCII.LF])

    cmd.push(
      'Time: ', data.time, [ASCII.LF],
      'Direction: ', data.direction, [ASCII.LF],
      'Fiat: ', data.fiat, [ASCII.LF],
      'Crypto: ', data.crypto, [ASCII.LF],
    )

    if (data.rate && receiptConfig.exchangeRate)
      cmd.push('Rate: ', data.rate, [ASCII.LF])

    cmd.push([ASCII.LF])


    if (data.txId)
      cmd.push(
        'TXID:', [ASCII.LF],
        '  ', data.txId.slice(0, data.txId.length / 2), [ASCII.LF],
        '  ', data.txId.slice(data.txId.length / 2), [ASCII.LF],
      )

    cmd.push([ASCII.LF])

    cmd.push(
      'Address:', [ASCII.LF],
      '  ', data.address.slice(0, Math.ceil(data.address.length / 2)), [ASCII.LF],
      '  ', data.address.slice(Math.ceil(data.address.length / 2)), [ASCII.LF],
    )

    cmd.push([ASCII.LF])

    if (data.address && receiptConfig.addressQRCode)
      printQRCode(cmd, data.address)

    const buffer = Buffer.concat(cmd.map(Buffer.from))
    const { return_int: return_intPrintText, return_message: return_messagePrintText } = rpu.printText(buffer)
    if (return_intPrintText < 0) return Promise.reject(new Error(return_messagePrintText))

    const { return_int: return_intCutPaper, return_message: return_messageCutPaper } = rpu.cutPaper()
    if (return_intCutPaper < 0) return Promise.reject(new Error(return_messageCutPaper))
    return Promise.resolve()
  })
}

function printWallet (wallet, printerCfg, code) {
  return runWithOpenPort(printerCfg, () => {
    const cmd = [
      code, ' PAPER WALLET', [ASCII.LF, ASCII.LF],
      'Spend', [ASCII.LF],
      'PRIVATE KEY', [ASCII.LF],
      wallet.privateKey.slice(0, wallet.privateKey.length / 2), [ASCII.LF],
      wallet.privateKey.slice(wallet.privateKey.length / 2), [ASCII.LF],
    ]

    printQRCode(cmd, wallet.privateKey)

    const buffer = Buffer.concat(cmd.map(Buffer.from))
    const { return_int: return_intPrintText, return_message: return_messagePrintText } = rpu.printText(buffer)
    if (return_intPrintText < 0) return Promise.reject(new Error(return_messagePrintText))

    const { return_int: return_intCutPaper, return_message: return_intCutPaper } = rpu.cutPaper()
    if (return_intCutPaper < 0) return Promise.reject(new Error(return_messageCutPaper))
    return Promise.resolve()
  })
}

function printCashboxReceipt (data, printerCfg) {
  return runWithOpenPort(printerCfg, () => {
    const cmd = []

    cmd.push('CASH COLLECTION RECEIPT', [ASCII.LF, ASCII.LF])

    if (data.batch) {
      if (data.batch.created)
        cmd.push(
          "Date and time", [ASCII.LF],
          "-------------", [ASCII.LF],
          data.batch.created, [ASCII.LF, ASCII.LF]
        )

      if (data.batch.id && data.batch.operationType)
        cmd.push(
          "Batch creation mode: automatic", [ASCII.LF],
          "Batch ID: ", data.batch.id, [ASCII.LF, ASCII.LF]
        )
      else
        cmd.push("Batch creation mode: manual", [ASCII.LF, ASCII.LF])

      if (data.batch.deviceId)
        cmd.push("Machine ID: ", data.batch.deviceId, [ASCII.LF])

      if (data.batch.machineName)
        cmd.push("Machine name: ", data.batch.machineName, [ASCII.LF])

      if (data.batch.billCount)
        cmd.push([ASCII.LF], "Bill count: ", data.batch.billCount, [ASCII.LF])

      if (data.batch.fiatTotals) {
        cmd.push(
          [ASCII.LF],
          "Total amount per fiat", [ASCII.LF],
          "---------------------", [ASCII.LF],
        )
        Object.entries(data.batch.fiatTotals)
          .forEach(([fiatCode, fiatTotal]) => {
            cmd.push(fiatCode, ": ", fiatTotal, [ASCII.LF])
          })
      }

      if (data.batch.billsByDenomination) {
        cmd.push(
          [ASCII.LF],
          "Bills by denomination", [ASCII.LF],
          "---------------------", [ASCII.LF],
        )
        Object.entries(data.batch.billsByDenomination)
          .forEach(([denom, count]) => {
            cmd.push(denom, ": ", count, [ASCII.LF])
          })
        cmd.push([ASCII.LF])
      }
    }

    const buffer = Buffer.concat(cmd.map(Buffer.from))
    const { return_int: return_intPrintText, return_message: return_messagePrintText } = rpu.printText(buffer)
    if (return_intPrintText < 0) return Promise.reject(new Error(return_messagePrintText))
    const { return_int: return_intCutPaper, return_messageCutPaper } = rpu.cutPaper()
    if (return_intCutPaper < 0) return Promise.reject(new Error(return_messageCutPaper))
    return Promise.resolve()
  })
}

module.exports = {
  printReceipt,
  printWallet,
  printCashboxReceipt,
  checkStatus
}
