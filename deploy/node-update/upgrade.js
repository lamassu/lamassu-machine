'use strict';

const nodemngr = require('./nodejs-manager')
const lmmngr = require('./lamassu-machine-manager')

const upgrade = () => Promise.resolve()
  .then(nodemngr.upgrade)
  .then(lmmngr.upgrade)
  .then(
    () => {
      console.log("all went well")
      process.exit(0)
    },
    err => {
      console.log(err)
      process.exit(1)
    }
  )

upgrade()
