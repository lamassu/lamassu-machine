'use strict';

const lmmngr = require('./lamassu-machine-manager')

const upgrade = () => lmmngr.upgrade()
  .then(
    () => console.log("all went well"),
    err => console.log(err)
  )

upgrade()
