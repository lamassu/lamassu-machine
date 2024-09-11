'use strict';

const fs = require('fs');
const async = require('./async');
const cp = require('child_process');
const report = require('./report').report;

const hardwareCode = process.argv[2];
const machineCode = process.argv[3];
const newPath = process.argv[4];

const basePath = newPath ? '/opt/lamassu-updates/extract' : '/tmp/extract'
const packagePath = `${basePath}/package/subpackage`

const machineWithMultipleCodes = ['upboard', 'up4000', 'coincloud', 'generalbytes', 'genmega']

const path = machineWithMultipleCodes.includes(hardwareCode) ?
  `${packagePath}/hardware/${hardwareCode}/${machineCode}` :
  `${packagePath}/hardware/${hardwareCode}`

const supervisorPath = machineWithMultipleCodes.includes(hardwareCode) ?
  `${packagePath}/supervisor/${hardwareCode}/${machineCode}` :
  `${packagePath}/supervisor/${hardwareCode}`

const udevPath = `${packagePath}/udev/aaeon`

const TIMEOUT = 600000;
const applicationParentFolder = hardwareCode === 'aaeon' ? '/opt/apps/machine' : '/opt'

function command(cmd, cb) {
  console.log(`Running command \`${cmd}\``)
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function updateUdev (cb) {
  console.log("Updating udev rules")
  if (hardwareCode !== 'aaeon') return cb()
  return async.series([
    async.apply(command, `cp ${udevPath}/* /etc/udev/rules.d/`),
    async.apply(command, 'udevadm control --reload-rules && udevadm trigger'),
  ], (err) => {
    if (err) throw err;
    cb()
  })
}

function updateSupervisor (cb) {
  console.log("Updating Supervisor services")
  if (hardwareCode === 'aaeon') return cb()

  const getOSUser = () =>
    fs.promises.readFile('/etc/os-release', { encoding: 'utf8' })
      .then(
        text => text
          .split('\n')
          .includes('IMAGE_ID=lamassu-machine-xubuntu') ?
            'lamassu' :
            'ubilinux',
        _err => 'ubilinux',
      )

  (machineWithMultipleCodes.includes(hardwareCode) ? getOSUser() : Promise.resolve('lamassu'))
    .then(osuser => {
      async.series([
        async.apply(command, `cp ${supervisorPath}/* /etc/supervisor/conf.d/`),
        async.apply(command, `sed -i 's|^user=.*\$|user=${osuser}|;' /etc/supervisor/conf.d/lamassu-browser.conf || true`),
        async.apply(command, 'supervisorctl update'),
        async.apply(command, 'supervisorctl restart all'),
      ], (err) => {
        if (err) throw err;
        cb()
      })
    })
}

function updateAcpChromium (cb) {
  console.log("Updating ACP Chromium")
  if (hardwareCode !== 'aaeon') return cb()
  return async.series([
    async.apply(command, `cp ${path}/sencha-chrome.conf /home/iva/.config/upstart/`),
    async.apply(command, `cp ${path}/start-chrome /home/iva/`),
  ], function(err) {
    if (err) throw err;
    cb()
  });
}

function installDeviceConfig (cb) {
  console.log("Installing `device_config.json`")
  try {
    const currentDeviceConfigPath = `${applicationParentFolder}/lamassu-machine/device_config.json`
    const newDeviceConfigPath = `${path}/device_config.json`

    // Updates don't necessarily need to carry a device_config.json file
    if (!fs.existsSync(newDeviceConfigPath)) return cb()

    const currentDeviceConfig = require(currentDeviceConfigPath)
    const newDeviceConfig = require(newDeviceConfigPath)

    if (currentDeviceConfig.cryptomatModel) {
      newDeviceConfig.cryptomatModel = currentDeviceConfig.cryptomatModel
    }
    if (currentDeviceConfig.billDispenser && newDeviceConfig.billDispenser) {
      newDeviceConfig.billDispenser.model = currentDeviceConfig.billDispenser.model
      newDeviceConfig.billDispenser.device = currentDeviceConfig.billDispenser.device
      newDeviceConfig.billDispenser.cassettes = currentDeviceConfig.billDispenser.cassettes
    }
    if (currentDeviceConfig.billValidator) {
      newDeviceConfig.billValidator.deviceType = currentDeviceConfig.billValidator.deviceType
      if (currentDeviceConfig.billValidator.rs232) {
        newDeviceConfig.billValidator.rs232.device = currentDeviceConfig.billValidator.rs232.device
      }
    }
    if (currentDeviceConfig.kioskPrinter) {
      newDeviceConfig.kioskPrinter.model = currentDeviceConfig.kioskPrinter.model
      newDeviceConfig.kioskPrinter.address = currentDeviceConfig.kioskPrinter.address

      if (currentDeviceConfig.kioskPrinter.maker) {
        newDeviceConfig.kioskPrinter.maker = currentDeviceConfig.kioskPrinter.maker
      }

      if (currentDeviceConfig.kioskPrinter.protocol) {
        newDeviceConfig.kioskPrinter.protocol = currentDeviceConfig.kioskPrinter.protocol
      }
    }
    if (currentDeviceConfig.compliance) {
      newDeviceConfig.compliance = currentDeviceConfig.compliance
    }

    // Pretty-printing the new configuration to retain its usual form.
    const adjustedDeviceConfig = JSON.stringify(newDeviceConfig, null, 2)
    fs.writeFileSync(currentDeviceConfigPath, adjustedDeviceConfig)

    return cb()
  } catch (err) {
    return cb(err)
  }
}

const upgrade = () => {
  const arch = hardwareCode === 'aaeon' ? '386' :
    hardwareCode === 'ssuboard' ? 'arm32' :
    'amd64'

  const commands = [
    async.apply(command, `tar zxf ${basePath}/package/subpackage.tgz -C ${basePath}/package/`),
    async.apply(command, `rm -rf ${applicationParentFolder}/lamassu-machine/node_modules/`),
    async.apply(command, `cp -PR ${basePath}/package/subpackage/lamassu-machine ${applicationParentFolder}`),
    async.apply(command, `cp -PR ${basePath}/package/subpackage/hardware/${hardwareCode}/node_modules ${applicationParentFolder}/lamassu-machine/`),
    async.apply(command, `mv ${applicationParentFolder}/lamassu-machine/verify/verify.${arch} ${applicationParentFolder}/lamassu-machine/verify/verify`),
    async.apply(command, `mv ${applicationParentFolder}/lamassu-machine/camera-streamer/camera-streamer.${arch} ${applicationParentFolder}/lamassu-machine/camera-streamer/camera-streamer`),
    async.apply(installDeviceConfig),
    async.apply(updateSupervisor),
    async.apply(updateUdev),
    async.apply(updateAcpChromium),
    async.apply(report, null, 'finished.')
  ]

  return new Promise((resolve, reject) => {
    async.series(commands, function(err) {
      return err ? reject(err) : resolve();
    });
  })
}

module.exports = { upgrade }
