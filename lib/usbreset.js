var fs = require('fs')
var path = require('path')

var CAM_VENDOR_ID = '046d'
var CAM_PRODUCT_ID = '0825'

function reset (basePath) {
  if (!basePath) {
    console.log('USB reset not set up.')
    return
  }

  var dirs = fs.readdirSync(basePath)

  for (var i = 0; i < dirs.length; i++) {
    var dir = dirs[i]

    try {
      var idProductPath = path.resolve(basePath, dir, 'idProduct')
      var idProduct = fs.readFileSync(idProductPath, {encoding: 'utf8'}).trim()
      var idVendorPath = path.resolve(basePath, dir, 'idVendor')
      var idVendor = fs.readFileSync(idVendorPath, {encoding: 'utf8'}).trim()

      if (idProduct !== CAM_PRODUCT_ID || idVendor !== CAM_VENDOR_ID) continue

      var devDir = path.resolve(basePath, dir)

      return authReset(devDir)
    } catch (err) {
      if (err.code && err.code === 'ENOENT') continue
      console.log(err.stack)
    }
  }
}

function authReset (devPath) {
  var authPath = path.resolve(devPath, 'authorized')

  try {
    fs.writeFileSync(authPath, '0')
    fs.writeFileSync(authPath, '1')
  } catch (err) {
    console.log(err.stack)
  }
}

exports.reset = reset
