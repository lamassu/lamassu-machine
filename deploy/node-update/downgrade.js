'use strict';

const nodemngr = require('./nodejs-manager')

const downgrade = () => nodemngr.downgrade()
  .then(
    () => console.log("all went well"),
    err => console.log(err)
  )

downgrade()
