var clim = require('clim')
clim.getTime = function () {
  return new Date().toISOString()
}
clim(console, true)
