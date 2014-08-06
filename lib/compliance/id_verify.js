'use strict';

var IdVerify = function(config) {
  this.trader = config.trader;
  this.idRecord = {};
};

module.exports = IdVerify;

IdVerify.factory = function factory(config) {
  return new IdVerify(config);
};

IdVerify.prototype.addLicense = function addLicense(data) {
  this.idRecord.license = data;
  this.idRecord.documentType = 'driversLicenseNA';  // North American driver's license
};

// e.g., last 4 of SSN
IdVerify.prototype.addLicenseCode = function addLicenseCode(code) {
  this.idRecord.licenseCode = code;
};

IdVerify.prototype.verify = function verify(cb) {
  var idRecord = this.idRecord;

  if (!idRecord.license || !idRecord.licenseCode)
    return cb(new Error('idRecord is incomplete'));

  this.trader.verifyId(idRecord, cb);
};

IdVerify.prototype.reset = function reset() {
  this.idRecord = {};
};
