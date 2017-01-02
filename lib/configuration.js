'use strict'

const fs = require('fs')
const path = require('path')

const _ = require('lodash')

const SOFTWARE_CONFIG = require('../software_config.json')
const DEVICE_CONFIG = require('../device_config.json')
const LICENSES = require('../licenses.json')

exports.loadConfig = function (commandLine) {
  const mockCryptoQR = {
    brain: {
      mockCryptoQR: {
        BTC: commandLine.mockBTC,
        ETH: commandLine.mockETH
      },
      wsPort: commandLine.port
    }
  }

  const config = _.merge({}, DEVICE_CONFIG, SOFTWARE_CONFIG,
    LICENSES, commandLine, mockCryptoQR)
  delete config._

  if (config.mockBv) config.id003.rs232.device = config.mockBv

  if (config.mockCam) {
    const fakeLicense = fs.readFileSync(path.join(__dirname,
      '../mock_data/compliance/license.jpg'))
    const pdf417Data = fs.readFileSync(path.join(__dirname,
      '../mock_data/compliance/nh.dat'))

    const mockCamConfig = {
      pairingData: config.mockPair,
      qrData: config.brain.mockCryptoQR,
      pdf417Data: pdf417Data,
      fakeLicense: fakeLicense
    }
    config.scanner = {
      mock: {
        data: mockCamConfig
      }
    }
  }

  return config
}
