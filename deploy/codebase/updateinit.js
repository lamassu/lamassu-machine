'use strict';

const fs = require('fs');
const async = require('./async');
const cp = require('child_process');
const report = require('./report').report;

const hardwareCode = process.argv[2];
const machineCode = process.argv[3];

const packagePath = '/tmp/extract/package/subpackage'

const path = hardwareCode === 'upboard' ?
  `${packagePath}/hardware/${hardwareCode}/${machineCode}` :
  `${packagePath}/hardware/${hardwareCode}`

const supervisorPath = hardwareCode === 'upboard' ?
  `${packagePath}/supervisor/${hardwareCode}/${machineCode}` :
  `${packagePath}/supervisor/${hardwareCode}`

const udevPath = `${packagePath}/udev/aaeon`

const TIMEOUT = 600000;
const applicationParentFolder = hardwareCode === 'aaeon' ? '/opt/apps/machine' : '/opt'

function command(cmd, cb) {
  cp.exec(cmd, {timeout: TIMEOUT}, function(err) {
    cb(err);
  });
}

function updateUdev (cb) {
  if (hardwareCode !== 'aaeon') return cb()

  async.series([ 
    async.apply(command, `cp ${udevPath}/* /etc/udev/rules.d/`),
    async.apply(command, 'udevadm control --reload-rules && udevadm trigger'),
  ], (err) => {
    if (err) throw err; 
    cb()
  })
}

function updateSupervisor (cb) {
  if (hardwareCode === 'aaeon') return cb()
  cp.exec('systemctl enable supervisor', {timeout: TIMEOUT}, function(err) {
    if (err) {
      console.log('failure activating systemctl')
    }

    async.series([ 
      async.apply(command, `cp ${supervisorPath}/* /etc/supervisor/conf.d/`),
      async.apply(command, `users | grep -q ubilinux && sed -i 's/user=machine/user=ubilinux/g' /etc/supervisor/conf.d/lamassu-browser.conf || true`),
      async.apply(command, 'supervisorctl update'),
    ], (err) => {
      if (err) throw err; 
      cb()
    })
  })
}

function updateAcpChromium (cb) {
  if (hardwareCode !== 'aaeon') return cb()

  async.series([ 
    async.apply(command, `cp ${path}/sencha-chrome.conf /home/iva/.config/upstart/` ),
    async.apply(command, `cp ${path}/start-chrome /home/iva/` ),
  ], function(err) {
    if (err) throw err;
    cb()
  });
}

function installDeviceConfig (cb) {
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
      newDeviceConfig.billValidator.rs232.device = currentDeviceConfig.billValidator.rs232.device
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

    cb()
  }
  catch (err) {
    cb(err)
  }
}

const commands = []

commands.push(
  async.apply(command, 'tar zxf /tmp/extract/package/subpackage.tgz -C /tmp/extract/package/'),
  async.apply(command, `cp -PR /tmp/extract/package/subpackage/lamassu-machine ${applicationParentFolder}`),
  async.apply(command, `cp -PR /tmp/extract/package/subpackage/hardware/${hardwareCode}/node_modules ${applicationParentFolder}/lamassu-machine/`)
)

if (hardwareCode === 'aaeon') {
  commands.push(async.apply(command, `mv ${applicationParentFolder}/lamassu-machine/verify/verify.386 ${applicationParentFolder}/lamassu-machine/verify/verify`))
} else if (hardwareCode === 'ssuboard') {
  commands.push(async.apply(command, `mv ${applicationParentFolder}/lamassu-machine/verify/verify.arm32 ${applicationParentFolder}/lamassu-machine/verify/verify`))
} else {
  commands.push(async.apply(command, `mv ${applicationParentFolder}/lamassu-machine/verify/verify.amd64 ${applicationParentFolder}/lamassu-machine/verify/verify`))
}

commands.push(
  async.apply(installDeviceConfig),
  async.apply(updateSupervisor),
  async.apply(updateUdev),
  async.apply(updateAcpChromium),
  async.apply(report, null, 'finished.')
)

async.series(commands, function(err) {
  if (err) throw err;
});
