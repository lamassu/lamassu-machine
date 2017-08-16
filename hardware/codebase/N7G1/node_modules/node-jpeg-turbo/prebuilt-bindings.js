const prebuild = require('prebuilt-bindings')

module.exports = prebuild({
  context: __dirname,
  bindings: [{
    name: 'jpegturbo'
  }]
})
