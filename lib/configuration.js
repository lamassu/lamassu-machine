'use strict'

const fs = require('fs')
const path = require('path')

const _ = require('lodash/fp')

const SOFTWARE_CONFIG = require('../software_config.json')
const DEVICE_CONFIG = require('../device_config.json')
const LICENSES = require('../licenses.json')

exports.loadConfig = function (commandLine) {
  const otherConfig = {
    brain: {
      wsPort: commandLine.port || 8080
    }
  }

  const config = _.mergeAll([{}, DEVICE_CONFIG, SOFTWARE_CONFIG,
    LICENSES, commandLine, otherConfig])
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

    config.scanner = _.assign(config.scanner, {
      mock: {
        data: mockCamConfig
      }
    })
  }

  return config
}
