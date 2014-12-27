'use strict';

module.exports = function generateError(name) {
  var CustomErr = function(msg) {
    this.message = msg;
    this.name = name;
    Error.captureStackTrace(this, CustomErr);
  };
  CustomErr.prototype = Object.create(Error.prototype);
  CustomErr.prototype.constructor = CustomErr;

  return CustomErr;
};
