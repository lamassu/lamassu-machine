const path = require('path')
const fs = require('fs')

const deviceConfig = require('../../device_config.json')

const zebra = require('./zebra')
const nippon = require('./nippon')

const ZEBRA_MODEL = 'Zebra-KR-403'
const NIPPON_MODEL = 'Nippon-2511D-2'
const NO_PRINTER_MODEL = 'None'

function configureAsZebra (printerCfg) {
  const address = printerCfg.address

  deviceConfig.kioskPrinter = {
    model: ZEBRA_MODEL,
    address
  }

  const deviceConfigPath = path.join(__dirname, '../../device_config.json')
  const jsonDeviceConfig = JSON.stringify(deviceConfig, null, '  ')

  fs.writeFile(deviceConfigPath, jsonDeviceConfig, err => {
    console.log('PRINTER: failed uptating device_config', err)
  })
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
  return new Promise((resolve, reject) => {
    const printerCfg = deviceConfig.kioskPrinter || { address: '/dev/ttyJ4' }
    const { maker, model } = printerCfg

    if (deviceConfig.brain.mockPrinter) {
      return resolve(require('../mocks/kioskPrinter'))
    }

    // No printer
    if (model === NO_PRINTER_MODEL) return reject(new Error('noPrinterConfiguredError'))

    // auto-detect
    // if maker: old config file, some shipments were sent out with Nippons but configured for Zebras
    // if no model: some gaias were shipped without a config
    if (maker || !model) {
      return resolve(autoDetect(printerCfg).catch(() => reject(new Error('noPrinterError'))))
    }

    if (model === ZEBRA_MODEL) return resolve(zebra)
    if (model === NIPPON_MODEL) return resolve(nippon)

    return reject(new Error('Unsupported printer configuration.'))
  })
}

module.exports = {
  load
}
