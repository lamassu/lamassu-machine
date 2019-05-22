module.exports = {
  checkStatus,
  printWallet,
  printReceipt
}

function checkStatus () {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ hasErrors: false }), 1000)
  })
}

function printWallet () {
  return Promise.resolve()
}

function printReceipt () {
  return Promise.resolve()
}
