const path = require('path')
const fs = require('fs')

const deviceConfig = require('../../device_config.json')

const zebra = require('./zebra')
const nippon = require('./nippon')

function configureAsZebra (printerCfg) {
  const address = printerCfg.address

  deviceConfig.kioskPrinter = {
    maker: 'Zebra',
    address
  }

  const jsonDeviceConfig = JSON.stringify(deviceConfig, null, '  ')
  fs.writeFileSync(path.join(__dirname, '../../device_config.json'), jsonDeviceConfig)
}

function autoDetect (printerCfg) {
  // this can be either nippon, zebra or no printer
  return zebra.checkStatus(printerCfg, 2000)
    .then(() => {
      // only zebras can respond
      configureAsZebra(printerCfg)
      return zebra
    })
    .catch(err => {
      // can still be nippon, zebra or noPrinter
      // configure as nippon for the duration of l-m process only
      // if not nippon printing will fail silently
      console.log(err)
      return nippon
    })
}

function load () {
  const printerCfg = deviceConfig.kioskPrinter || { address: '/dev/ttyJ4' }
  const { maker, model } = printerCfg
  const noPrinterError = new Error('No printer found')

  if (deviceConfig.brain.mockPrinter) {
    return Promise.resolve(require('../mocks/kioskPrinter'))
  }

  // No printer
  if (maker === 'None') return Promise.reject(noPrinterError)

  // with model  ===  old config version
  // no maker    ===  gaia shipped without config
  if (model || !maker) {
    return autoDetect(printerCfg).catch(() => Promise.reject(noPrinterError))
  }

  if (maker === 'Zebra') return Promise.resolve(zebra)
  if (maker === 'Nippon') return Promise.resolve(nippon)

  return Promise.reject(new Error('Unsupported printer configuration.'))
}

module.exports = {
  load
}
