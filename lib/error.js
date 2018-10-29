const _ = require('lodash/fp')

const E = function (name) {
  var CustomErr = function (msg) {
    this.message = msg || _.startCase(name)
    this.name = name
    Error.captureStackTrace(this, CustomErr)
  }
  CustomErr.prototype = Object.create(Error.prototype)
  CustomErr.prototype.constructor = CustomErr
  CustomErr.code = name

  return CustomErr
}

module.exports = E

function register (errorName) {
  E[errorName] = E(errorName)
}

register('CaHashError')
register('RatchetError')
register('StaleError')
