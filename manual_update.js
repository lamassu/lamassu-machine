'use strict'

var fs = require('fs')
var path = require('path')
var _ = require('lodash')

var codeRoot = __dirname
var SOFTWARE_CONFIG_PATH = path.resolve(codeRoot, 'software_config.json')
var DEVICE_CONFIG_PATH = path.resolve(codeRoot, 'device_config.json')

var softwareConfig = JSON.parse(fs.readFileSync(SOFTWARE_CONFIG_PATH))
var deviceConfig = JSON.parse(fs.readFileSync(DEVICE_CONFIG_PATH))

var masterConfig = softwareConfig
_.merge(masterConfig, deviceConfig)
var config = masterConfig.updater.extractor

config.skipVerify = true
var extractor = require(codeRoot + '/lib/update/extractor').factory(config)

var fileInfo = {
  rootPath: '/tmp/extract',
  filePath: '/tmp/update.tar'
}

function triggerWatchdog (cb) {
  var donePath = '/tmp/extract/done.txt'
  fs.writeFile(donePath, 'DONE\n', null, function (err) {
    if (err) throw err
    console.log('watchdog triggered')
    cb()
  })
}

process.on('SIGTERM', function () {
  // Immune
})

extractor.extract(fileInfo, function (err) {
  console.log('extracting...')
  if (err) throw err
  triggerWatchdog(function () { console.log('all done.') })
})
