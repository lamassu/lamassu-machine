'use strict'
const fs = require('fs')
const path = require('path')

const codeRoot = path.resolve(__dirname)
const deviceConfig = require(path.join(codeRoot, 'device_config.json'))
const config = deviceConfig.updater.extractor
config.skipVerify = true

const extractor = require(path.join(codeRoot, 'lib/update/extractor')).factory(config)

const rootPath = '/opt/lamassu-updates/extract/'
const downloadDirPath = '/opt/lamassu-updates/download/'
const filePath = path.join(downloadDirPath, 'update.tar')

function triggerWatchdog (cb) {
  const donePath = path.join(rootPath, 'done.txt')
  fs.writeFile(donePath, 'DONE\n', null, function (err) {
    if (err) throw err
    console.log('watchdog triggered')
    cb()
  })
}

process.on('SIGTERM', function () { /* Immune */ })

extractor.extract({ rootPath, filePath, downloadDirPath }, function (err) {
  console.log('extracting...')
  if (err) throw err
  triggerWatchdog(function () { console.log('all done.') })
})
