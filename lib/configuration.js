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
      wsPort: commandLine.port || 8080,
      wsHost: commandLine.host || 'localhost'
    }
  }

  const config = _.mergeAll([{}, DEVICE_CONFIG, SOFTWARE_CONFIG,
    LICENSES, commandLine, otherConfig])
  delete config._

  if (config.mockBv) config.billValidator.rs232.device = config.mockBv
  if (commandLine.dataPath) config.brain.dataPath = commandLine.dataPath

  if (config.mockCam) {
    const fakeLicense = fs.readFileSync(path.join(__dirname,
      '../mock_data/compliance/license.jpg'))
    const fakeFacePhoto = fs.readFileSync(path.join(__dirname,
        '../mock_data/compliance/facephoto.jpg'))
    const fakeFacePhotoTC = fs.readFileSync(path.join(__dirname,
        '../mock_data/compliance/tcphoto.jpg'))
    const pdf417Data = fs.readFileSync(path.join(__dirname,
      '../mock_data/compliance/nh.dat'))

    const mockCamConfig = {
      pairingData: config.mockPair,
      qrData: config.brain.mockCryptoQR,
      qrDataSource: config.brain.mockQrSource,
      pk: config.brain.mockPK,
      pdf417Data: pdf417Data,
      fakeLicense: fakeLicense,
      fakeFacePhoto: fakeFacePhoto,
      fakeFacePhotoTC: fakeFacePhotoTC,
    }

    config.scanner = _.assign(config.scanner, {
      mock: {
        data: mockCamConfig
      }
    })
  }

  return config
}
