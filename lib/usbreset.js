var fs = require('fs')
var cp = require('child_process')
var path = require('path')
var leftPad = require('left-pad')

var CAM_VENDOR_ID = '046d'
var CAM_PRODUCT_ID = '0825'
var RESET_BIN = path.resolve(__dirname, '..', 'bin', 'usbreset')

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

      var busPath = path.resolve(basePath, dir, 'busnum')
      var devPath = path.resolve(basePath, dir, 'devnum')
      var busNum = fs.readFileSync(busPath, {encoding: 'utf8'}).trim()
      var devNum = fs.readFileSync(devPath, {encoding: 'utf8'}).trim()

      var busNumPad = leftPad(busNum, 3, 0)
      var devNumPad = leftPad(devNum, 3, 0)

      var resetPath = path.resolve('/dev/bus/usb/', busNumPad, devNumPad)

      cp.execFile(RESET_BIN, [resetPath], {}, function (err, stdout, stderr) {
        if (err) console.log(err.stack)
      })

      return
    } catch (err) {
      if (err.code && err.code === 'ENOENT') continue
      console.log(err.stack)
    }
  }
}

exports.reset = reset
