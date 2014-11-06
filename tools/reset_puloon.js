var config = {
  device: '/dev/cu.NoZAP-PL2303-00105414'
};
var billDispenser = require('../lib/billdispenser').factory(config);
var device = billDispenser.device;
device.on('error', console.log);
device.on('close', console.log);
device.on('connected', console.log);

billDispenser.init({
  cartridges: [
    {denomination: 5, count: 220},
    {denomination: 20, count: 250}
  ],
  virtualCartridges: [10],
  currency: 'USD'
});
