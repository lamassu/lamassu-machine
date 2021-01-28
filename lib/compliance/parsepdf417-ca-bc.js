var _ = require('lodash/fp')

module.exports.parse = function parse (data) {
  try {
    return parseRaw(data)
  } catch (ex) {
    return null
  }
}

function parseRaw (data) {
  const lines = []
  const result = {}

  const track1Start = data.indexOf('%')
  const track2Start = data.indexOf(';')
  const track3Start = data.indexOf('_%')

  const track1 = data.substring(track1Start, track2Start)
  const track2 = data.substring(track2Start, track3Start)
  const track3 = data.substring(track3Start, data.length)

  const province = data.substring(track1Start + 1, track1Start + 3)

  const cityIndex = track1Start + 3
  const cityFinishIndex =
    data.substring(cityIndex, cityIndex + 13).indexOf('^') === -1
      ? cityIndex + 13
      : data.substring(cityIndex, cityIndex + 13).indexOf('^') + cityIndex
  const city = data.substring(cityIndex, cityFinishIndex)

  const nameIndex = cityFinishIndex + 1
  const nameFinishIndex =
    data.substring(nameIndex, nameIndex + 35).indexOf('^') === -1
      ? nameIndex + 35
      : data.substring(nameIndex, nameIndex + 35).indexOf('^') + nameIndex
  const name = data.substring(nameIndex, nameFinishIndex)
  const firstName = name.substring(name.indexOf('$') + 1, name.length)
  const lastName = name.substring(0, name.indexOf(','))

  // const addressIndex = nameFinishIndex + 1;
  // const addressFinishIndex =
  //   data.substring(addressIndex, addressIndex + 29).indexOf("^") === -1
  //     ? addressIndex + 29
  //     : data.substring(addressIndex, addressIndex + 29).indexOf("^") +
  //       addressIndex;
  // const address = data.substring(addressIndex, addressFinishIndex)

  const addressIndex = nameFinishIndex + 1
  const addressFinishIndex =
    data.substring(addressIndex, track1.length).indexOf('^') + addressIndex
  const address = data
    .substring(addressIndex, addressFinishIndex)
    .replace('$', ' ')

  const provinceCode = data.substring(track2Start + 1, track2Start + 7)

  const idNumberIndex = track2Start + 7
  const idNumberFinishIndex = data.substring(idNumberIndex, idNumberIndex + 13).indexOf('=') === -1
    ? idNumberIndex + 13
    : data.substring(idNumberIndex, idNumberIndex + 13).indexOf('=') + idNumberIndex
  const idNumber = data.substring(idNumberIndex, idNumberFinishIndex)

  const expirationDateIndex = idNumberFinishIndex + 1
  const expirationDateFinishIndex = expirationDateIndex + 4
  const expirationDate = data.substring(expirationDateIndex, expirationDateFinishIndex)
  const expirationMonth = expirationDate.substring(2, 4)
  const expirationYear = expirationDate.substring(0, 2)

  const birthDateIndex = expirationDateFinishIndex
  const birthDateFinishIndex = birthDateIndex + 8
  const birthDate = data.substring(birthDateIndex, birthDateFinishIndex)

  console.log(track1Start)
  console.log(track2Start)
  console.log(track3Start)
  console.log(track1)
  console.log(track2)
  console.log(track3)
  console.log('state: ' + province)
  console.log('city: ' + city)
  console.log('full name: ' + name)
  console.log('first name: ' + firstName)
  console.log('last name: ' + lastName)
  console.log('address: ' + address)
  console.log('province code: ' + provinceCode)
  console.log('id number: ' + idNumber)
  console.log('expiration date: ' + expirationDate)
  console.log('expiration month: ' + expirationMonth)
  console.log('expiration year: ' + expirationYear)
  console.log('birth date: ' + birthDate)
}
