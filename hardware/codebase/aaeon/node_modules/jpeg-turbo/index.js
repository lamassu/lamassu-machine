var path = require('path')

var binary = require('node-pre-gyp')

var binding = require(binary.find(
  path.resolve(path.join(__dirname, './package.json'))))

// Copy exports so that we can customize them on the JS side without
// overwriting the binding itself.
Object.keys(binding).forEach(function(key) {
  module.exports[key] = binding[key]
})

// Convenience wrapper for Buffer slicing.
module.exports.compressSync = function(buffer, optionalOutBuffer, options) {
  var out = binding.compressSync(buffer, optionalOutBuffer, options)
  return out.data.slice(0, out.size)
}

// Convenience wrapper for Buffer slicing.
module.exports.decompressSync = function(buffer, optionalOutBuffer, options) {
  var out = binding.decompressSync(buffer, optionalOutBuffer, options)
  out.data = out.data.slice(0, out.size)
  return out
}
