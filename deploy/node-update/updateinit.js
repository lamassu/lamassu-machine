'use strict';

const nodemngr = require('./nodejs-manager')
const lmmngr = require('./lamassu-machine-manager')

const upgrade = () => Promise.resolve()
  .then(nodemngr.upgrade)
  .then(lmmngr.upgrade)
  .then(
    () => console.log("all went well"),
    err => console.log(err)
  )

upgrade()
