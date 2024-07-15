'use strict'

const path = require('path')
const fs = require('fs')
const child_process = require('child_process')

/*
 * Package tree structure:
 * package/
 *     nodejs-manager.js # this script
 *     updatescript.js   # entry point
 *     node              # new Node.js executable

 * Backup directory tree structure:
 * backup/
 *     lamassu-machine/
 *     node
 */

const replaceAll = (s, p, r) => s.replace(
  new RegExp(p.replace(/([\/\,\!\\\^\$\{\}\[\]\(\)\.\*\+\?\|<>\-\&])/g, "\\$&"), "g"),
  r.replace(/\$/g, "$$$$")
)

const mkdir = path => new Promise((resolve, reject) =>
  fs.mkdir(path, null, err => err ? reject(err) : resolve())
)

const readFile = path => new Promise((resolve, reject) =>
  fs.readFile(path, { encoding: 'utf8' }, (err, data) => err ? reject(err) : resolve(data))
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

const rm = _ => execFile('rm', arguments)
const cp = _ => execFile('cp', arguments)
const mv = _ => execFile('mv', arguments)
const supervisorctl = _ => execFile('supervisorctl', arguments)


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


const stopSupervisorServices = () => supervisorctl('stop', 'all')

const restartSupervisorServices = () => Promise.resolve()
  .then(() => supervisorctl('update', 'all'))


const backupMachine = () => mkdir(BACKUP)
  // Backup /opt/lamassu-machine/
  .then(() => cp('-ar', LAMASSU_MACHINE, LAMASSU_MACHINE_BACKUP))

const writeOldService = (service_from, service_to, from_name, to_name) => readFile(service_from)
  .then(service => replaceAll(service, OPT, BACKUP))
  .then(service => replaceAll(service, from_name, to_name))
  .then(service => replaceAll(service, NODE, NODE_BACKUP))
  .then(service => writeFile(service_to, service))

const installOldServices = () => Promise.all([
  writeOldService(WATCHDOG_CONF, OLD_WATCHDOG_CONF, 'lamassu-watchdog', 'old-lamassu-watchdog'),
  writeOldService(UPDATER_CONF, OLD_UPDATER_CONF, 'lamassu-updater', 'old-lamassu-updater')
])

// Install new node
const upgradeNode = () => Promise.resolve()
  // Backup /usr/bin/node
  .then(() => cp(NODE, NODE_BACKUP))
  .then(() => cp(NEW_NODE, NODE))

const upgrade = () => Promise.resolve()
  .then(stopSupervisorServices)
  .then(backupMachine)
  .then(upgradeNode)
  .then(installOldServices)
  .then(restartSupervisorServices)


const downgradeMachine = () => Promise.resolve()
  .then(() => rm('-rf', LAMASSU_MACHINE))
  .then(() => mv(LAMASSU_MACHINE_BACKUP, LAMASSU_MACHINE))

const downgradeNode = () => cp(NODE_BACKUP, NODE)

const uninstallOldServices = () => Promise.all([unlink(OLD_WATCHDOG_CONF), unlink(OLD_UPDATER_CONF)])

const removeBackup = () => rm('-rf', BACKUP)

const downgrade = () => Promise.resolve()
  .then(stopSupervisorServices)
  .then(downgradeMachine)
  .then(downgradeNode)
  .then(uninstallOldServices)
  .then(removeBackup)
  .then(restartSupervisorServices)


module.exports = { upgrade, downgrade, new_node_path: NEW_NODE }
