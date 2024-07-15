'use strict';

const { spawn } = require('child_process')
const nodemngr = require('./nodejs-manager')
const lmmngr = require('./lamassu-machine-manager')

const [script, platform, model, updated_path, is_child] = process.argv.slice(1)

const upgrade = () => Promise.resolve()
  .then(nodemngr.upgrade)
  .then(lmmngr.upgrade)
  .then(
    () => console.log("all went well"),
    err => console.log(err)
  )

const respawn = () => spawn(
  nodemngr.new_node_path,
  [script, platform, model, updated_path, true],
  { detached: true, stdio: 'inherit' }
).unref()

if (is_child)
  upgrade()
else
  respawn()
