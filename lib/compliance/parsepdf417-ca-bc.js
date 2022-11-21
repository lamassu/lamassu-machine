var _ = require('lodash/fp')

module.exports.parse = function parse (data) {
  const track1Start = data.indexOf('%')
  const track2Start = data.indexOf(';')
  const track3Start = data.indexOf('_%')

  if (track1Start === -1 || track2Start === -1 || track3Start === -1) return null

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
  const formattedExpirationDate = formatDate(expirationYear, expirationMonth)

  const birthDateIndex = expirationDateFinishIndex
  const birthDateFinishIndex = birthDateIndex + 8
  const birthDate = data.substring(birthDateIndex, birthDateFinishIndex)

  const postalCode = data.substring(track3Start + 4, track3Start + 15)
  const sex = data.substring(track3Start + 31, track3Start + 32)
  const height = data.substring(track3Start + 32, track3Start + 35)
  const weight = data.substring(track3Start + 35, track3Start + 38)
  const hairColor = data.substring(track3Start + 38, track3Start + 41)
  const eyeColor = data.substring(track3Start + 41, track3Start + 44)
  const phoneNumber = data.substring(track3Start + 44, track3Start + 54)

  const result = {
    state: province.trim(),
    city: city.trim(),
    country: 'CA',
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    address: address.trim(),
    documentNumber: idNumber.trim(),
    issuerIdentificationNumber: provinceCode.trim(),
    expirationDate: formattedExpirationDate.trim(),
    dateOfBirth: birthDate.trim(),
    postalCode: postalCode.trim(),
    gender: sex.trim(),
    height: height.trim(),
    weight: weight.trim(),
    hairColor: hairColor.trim(),
    eyeColor: eyeColor.trim(),
    phoneNumber: phoneNumber.trim()
  }

  return _.pickBy(_.identity, result)
}

function formatDate (year, month) {
  const day = new Date(year, month, 0).getDate()
  return `20${year}${month}${day}`
}
