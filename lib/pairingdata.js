exports.process = function _process (data) {
  // TODO: Moar checking, lengths, valid IPs, etc
  if (!/^[0-9A-Z $%*+\-.\/:]+$/.test(data)) return null
  var arr = data.split('$')
  if (arr.length !== 4) return null

  // Insert a colon each 2 chars
  var deviceId = arr[2].replace(/(..(?!$))/g, '$1:')

  var result = {
    connectionInfo: {
      host: arr[0],
      port: arr[1],
      deviceId: deviceId
    },
    token: arr[3].toLowerCase()
  }

  if (!/^[\d\.]+$/.test(result.connectionInfo.host)) return null  // IP address
  if (!/^\d+$/.test(result.connectionInfo.port)) return null
  if (!/^[\dA-F:]+$/.test(result.connectionInfo.deviceId)) return null
  if (!/^[\da-f]+$/.test(result.token)) return null

  return result
}
