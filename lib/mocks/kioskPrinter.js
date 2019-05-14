module.exports = {
  checkStatus,
  printWallet
}

function checkStatus () {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ hasErrors: true }), 1000)
  })
}

function printWallet () {
  return Promise.resolve()
}
