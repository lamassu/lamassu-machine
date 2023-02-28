const number = process.argv[2]
const machine = process.argv[3]
const old = require('./config.json')

function configAddField (scope, fieldCode, fieldType, fieldClass, value) {
  return {
    fieldLocator: {
      fieldScope: {
        crypto: scope.crypto,
        machine: scope.machine
      },
      code: fieldCode,
      fieldType,
      fieldClass
    },
    fieldValue: { fieldType, value }
  }
}

const scope = { crypto: 'global', machine }

const newFields = [
  configAddField(scope, 'cashOutEnabled', 'onOff', null, false),
  configAddField(scope, 'machineName', 'string', null, number),
  configAddField(scope, 'machineModel', 'string', null, 'Linux')
]
const data = { config: newFields.concat(old.config) }
console.log(JSON.stringify(data))
