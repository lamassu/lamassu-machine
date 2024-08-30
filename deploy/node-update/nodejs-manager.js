'use strict'

const path = require('path')
const fs = require('fs')
const child_process = require('child_process')

const ensure_x64 = process.arch === 'x64' ?
  Promise.resolve() :
  Promise.reject("This upgrade package is for x64 platforms only")

/*
 * Package tree structure:
 * package/
 *     nodejs-manager.js # this script
 *     updatescript.js   # entry point
 *     node              # new Node.js executable

 * Backup directory tree structure:
 * backup/
 *     lamassu-machine/
 *     supervisor/
 *     node
 */

const replaceAll = (s, p, r) => s.replace(
  new RegExp(p.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|<>\-\&])/g, "\\$&"), "g"),
  r.replace(/\$/g, "$$$$")
)

const writeFile = (path, data) => new Promise((resolve, reject) =>
  fs.writeFile(path, data, null, err => err ? reject(err) : resolve())
)

const unlink = path => new Promise((resolve, reject) =>
  fs.unlink(path, err => err ? reject(err) : resolve())
)

const execFile = (cmd, args) => new Promise((resolve, reject) =>
  child_process.execFile(cmd, args, null, err => err ? reject(err) : resolve())
)

const cp = args => execFile('cp', args)
const mv = args => execFile('mv', args)
const rm = args => execFile('rm', args)
const sed = args => execFile('sed', args)
const supervisorctl = args => execFile('supervisorctl', args)


const PACKAGE = path.resolve(__dirname) // TODO: confirm this
const OPT = '/opt/'
const BACKUP = path.join(OPT, 'backup/')

const LAMASSU_MACHINE = path.join(OPT, 'lamassu-machine/')
const LAMASSU_MACHINE_BACKUP = path.join(BACKUP, 'lamassu-machine/')

const NODE = '/usr/bin/node'
const NODE_BACKUP = path.join(BACKUP, 'node')
const NEW_NODE = path.join(PACKAGE, 'node')

const SUPERVISOR_CONF = '/etc/supervisor/conf.d/'
const WATCHDOG_CONF = path.join(SUPERVISOR_CONF, 'lamassu-watchdog.conf')
const OLD_WATCHDOG_CONF = path.join(SUPERVISOR_CONF, 'old-lamassu-watchdog.conf')
const UPDATER_CONF = path.join(SUPERVISOR_CONF, 'lamassu-updater.conf')
const OLD_UPDATER_CONF = path.join(SUPERVISOR_CONF, 'old-lamassu-updater.conf')
const SUPERVISOR_BACKUP = path.join(BACKUP, 'supervisor')


const [script, platform, model, updated_path, is_child] = process.argv.slice(1)

const respawn = () => {
  child_process.spawn(
    NEW_NODE,
    [script, platform, model, updated_path, true],
    { detached: true, stdio: 'inherit' }
  ).unref()
  process.exit(0)
}

const respawn_if_needed = () => is_child ? Promise.resolve() : respawn()


const stopSupervisorServices = () => {
  console.log("Stopping Supervisor services")
  return supervisorctl(['stop', 'all'])
}

const restartSupervisorServices = () => {
  console.log("Restarting Supervisor services")
  return supervisorctl(['update', 'all'])
    .then(() => supervisorctl(['restart', 'all']))
}


const backupMachine = () => {
  console.log("Backing up machine")
  return fs.promises.mkdir(BACKUP, { recursive: true })
    // Backup /opt/lamassu-machine/
    .then(() => cp(['-ar', LAMASSU_MACHINE, LAMASSU_MACHINE_BACKUP]))
    .then(() => sed(['-i', 's|\\<deviceConfig\\.brain\\.dataPath\\>|path.resolve(__dirname, &)|;', path.join(LAMASSU_MACHINE_BACKUP, 'watchdog.js')]))
}

const writeOldService = (service_from, service_to, from_name, to_name) =>
  fs.promises.readFile(service_from, { encoding: 'utf8' })
    .then(service => replaceAll(service, OPT, BACKUP))
    .then(service => replaceAll(service, from_name, to_name))
    .then(service => replaceAll(service, NODE, NODE_BACKUP))
    .then(service => writeFile(service_to, service))

const getOS = () => fs.promises.readFile('/etc/os-release', { encoding: 'utf8' })
  .then(
    text => text.split('\n').includes('IMAGE_ID=lamassu-machine-xubuntu') ?
      'xubuntu' : 'ubilinux',
    _err => null,
  )

const installOldServices = () => {
  console.log("Installing fallback Supervisor services")
  const fixLamassuBrowserService = (os, watchdog_conf) => (os === 'xubuntu') ?
    Promise.resolve() :
    fs.promises.readFile(watchdog_conf, { encoding: 'utf8' })
      .then(service => service.replace('/home/lamassu/chrome-linux/chrome', '/usr/bin/chromium'))
      .then(service => writeFile(watchdog_conf, service))

  return Promise.all([
    cp(['-ar', SUPERVISOR_CONF, SUPERVISOR_BACKUP]),
    getOS()
  ])
    .then(([_, os]) => Promise.all([
      fixLamassuBrowserService(os, path.join(SUPERVISOR_CONF, 'lamassu-browser.conf')),
      writeOldService(WATCHDOG_CONF, OLD_WATCHDOG_CONF, 'lamassu-watchdog', 'old-lamassu-watchdog'),
      writeOldService(UPDATER_CONF, OLD_UPDATER_CONF, 'lamassu-updater', 'old-lamassu-updater')
    ]))
}

// Install new node
const upgradeNode = () => {
  console.log("Upgrading Node.js executable")
  return Promise.resolve()
    // Backup /usr/bin/node
    .then(() => cp([NODE, NODE_BACKUP]))
    .then(() => cp([NEW_NODE, NODE]))
}

const upgrade = () => {
  console.log("Starting Node.js upgrade process")
  return ensure_x64
    .then(respawn_if_needed)
    .then(stopSupervisorServices)
    .then(backupMachine)
    .then(upgradeNode)
    .then(installOldServices)
    .then(restartSupervisorServices)
    .then(() => undefined)
}


const downgradeMachine = () => {
  console.log("Restoring backed-up lamassu-machine")
  return Promise.resolve()
    .then(() => rm(['-rf', LAMASSU_MACHINE]))
    .then(() => mv([LAMASSU_MACHINE_BACKUP, LAMASSU_MACHINE]))
}

const downgradeNode = () => {
  console.log("Restoring backed-up Node.js")
  return cp([NODE_BACKUP, NODE])
}

const uninstallOldServices = () => {
  console.log("Removing old Supervisor services")
  return Promise.all([
    unlink(OLD_WATCHDOG_CONF),
    unlink(OLD_UPDATER_CONF),
    fs.promises.readdir(SUPERVISOR_BACKUP, { encoding: 'utf8' })
      .then(fnames => fnames.map(fname => path.join(SUPERVISOR_BACKUP, fname)))
  ])
    .then(([_watchdog, _updater, services]) => Promise.all(
      services.map(service => cp([service, '-t', SUPERVISOR_CONF]))
    ))
}

const removeBackup = () => {
  console.log("Removing backup")
  return rm(['-rf', BACKUP])
}

const downgrade = () => {
  console.log("Starting Node.js downgrade process")
  return ensure_x64
    .then(respawn_if_needed)
    .then(stopSupervisorServices)
    .then(downgradeMachine)
    .then(downgradeNode)
    .then(uninstallOldServices)
    .then(removeBackup)
    .then(restartSupervisorServices)
    .then(() => undefined)
}


module.exports = { upgrade, downgrade }
